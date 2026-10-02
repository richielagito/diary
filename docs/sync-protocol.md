# Sync protocol

Diary can sync between devices through a server. This page describes exactly what the app sends, so anyone can check the claim that the server cannot read a diary. The client code is in `src/sync/` and `src/account/`.

Sync is optional. An app built without `VITE_API_URL` has no account screen and makes none of these requests.

## What the server can and cannot see

The server sees:

- the account email, its plan and how much storage it uses;
- the interface language, sent with an email sign-in request (`lang`);
- the Google account identity, when Google sign-in is used;
- the IP address and timing of every request, like any server;
- how many records an account has, the size of each one, when each was uploaded, a stable id per record and how often each id is rewritten (so it can tell, for example, that one hidden record is edited every day, though not what it says). It is not told which day a record belongs to or which kind of data it holds, but it can often infer both: a record's first upload time is almost always the entry's day, and the first sync uploads records collection by collection, entries in date order;
- the wrapped key, its salt and its iteration count (useless without the passphrase).

The server never receives diary text, moods, tags, chats, memories, summaries, letters, settings or the AI API key (it is part of the synced AI setting and is encrypted like the rest). It is not told the date an entry belongs to or which kind of data a record holds; as said above, it can often infer them from when and in what order records are uploaded.

Not protected:

- a server that replays old blobs or drops records: besides withholding data, it can roll an entry back to an earlier version or delete it again on a device;
- a host that serves modified app code;
- a weak passphrase against offline guessing if the server database leaks;
- the diary, the session token and the sync keys are stored unencrypted in the browser's storage on each device, so anyone with access to the browser profile can read the diary (sync does not change that);
- metadata: sizes, timing, upload order and how often a record changes are visible to the server, and usually reveal which day an entry belongs to.

## Keys

1. On the first device the app creates 32 random bytes, the master secret.
2. The passphrase (NFKC-normalized, at least 10 characters) is stretched with PBKDF2-SHA256, 600,000 iterations and a 16-byte random salt, into an AES-256-GCM key that wraps the master secret. The server stores `{ keyId, salt, wrapped, iterations }`.
3. Two keys are derived from the master secret with HKDF-SHA256: an AES-256-GCM encryption key (info `diary-sync enc v1`) and an HMAC-SHA256 id key (info `diary-sync id v1`).
4. On the device the two derived keys are kept in IndexedDB as non-extractable `CryptoKey`s. The passphrase and the master secret are not stored.

A wrong passphrase fails to unwrap the master secret, so it is detected on the device.

## Records

Every synced item is one record. Its plaintext is an envelope:

```json
{ "v": 1, "c": "entries", "k": "2026-10-01", "t": 1790812800000, "d": { "…": "the record" } }
```

- `c` is the collection: `entries`, `chatMessages`, `memories`, `summaries`, `letters` or `settings`.
- `k` is the record's key inside that collection (for example the date of an entry, or the name of a setting).
- `t` is when it last changed, in milliseconds.
- `d` is the record, or `null` when it was deleted. For `settings`, `d` is `{ "value": … }`. Settings that describe only one device (when it last exported, whether storage is persistent) are not synced.

The record id on the server is the first 16 bytes of `HMAC-SHA256(idKey, c + "\n" + k)`, base64url. The blob is a 12-byte random IV followed by the AES-256-GCM ciphertext of the envelope, base64, with the id as additional authenticated data, so a blob moved to another id does not decrypt.

A client that meets an envelope with `v` greater than it knows stops syncing and asks to be updated. Records in a collection it does not know are ignored.

## Requests

Every request with a body sends `Content-Type: application/json`. Signed-in requests send `Authorization: Bearer <token>`. Errors are `{ "error": "<code>" }`.

| Request | Purpose |
|---|---|
| `POST /auth/email/start` `{ email, lang }` | Email a sign-in code (6 digits) |
| `POST /auth/email/verify` `{ email, code }` | `{ token }` |
| `GET /auth/google/start?return=<origin>&challenge=<c>` | Redirect to Google; `challenge` is the SHA-256 (base64url) of a random verifier the browser keeps |
| `POST /auth/exchange` `{ code, verifier }` | `{ token }`, after Google sent the browser back with `#login=<code>` |
| `POST /auth/logout` | End this session |
| `GET /account` | `{ email, plan, key, usage: { bytes, limit } }` |
| `PUT /account/key` `{ keyId, salt, wrapped, iterations, reset? }` | Store the wrapped key. `reset: true` replaces it, deletes every record and needs a new `keyId` |
| `DELETE /account` | Delete the account and its records |
| `GET /sync?since=<rev>` | `{ keyId, records: [{ id, blob, rev }], rev, more }` |
| `POST /sync` `{ keyId, records: [{ id, blob, prevRev }] }` | `{ applied: [{ id, rev }], conflicts: [id] }` |

Limits: 1 MB per record, 20 MB per account, 100 records per request. The server accepts up to 4 MB per request and this client sends at most 1 MB. A record larger than 1 MB is not uploaded and is reported to the user.

Sync may be limited to accounts with an active plan; the server answers `plan_required` otherwise.

### Errors the client handles

| Status and code | What this client does |
|---|---|
| 401 `unauthorized` | Asks the user to sign in again and keeps the sync keys |
| 403 `plan_required` | Reports that sync is not active for this account |
| 409 `key_changed` | Another device reset sync: asks for the passphrase |
| 409 `key_exists` | Another device created the passphrase first: asks for that passphrase instead |
| 413 `quota_exceeded` | This round stops uploading and reports it; what was already downloaded in that round is kept. The next sync tries again (a later edit, coming back online or returning to the app starts one) |
| 400 `invalid_code` | Reports a wrong or expired sign-in code |
| 429 `rate_limited` | Reports "too often" on sign-in; during sync it retries later with growing delays |

Network failures, server errors (5xx) and any other unexpected answer are retried later with growing delays.

## Syncing

The server gives every write a revision number that only grows within an account.

- **Pull.** The client asks for everything after its cursor and stores the returned `rev` as the new cursor. It compares `keyId` with its own key id before decrypting anything: a different id means another device reset sync, and the client asks for the passphrase again. A `rev` lower than the `since` it sent means the server's history went backwards; the client forgets its cursor and revisions and starts from 0. A pulled record is only accepted under the id its collection and key hash to; anything else is dropped.
- **Push.** For each record the client sends `prevRev`, the revision it last saw for that record (0 for a new one). The server writes the record only if that is still its revision; otherwise the id comes back in `conflicts`, and the client pulls, merges and pushes again. A sync round repeats pull and push at most three times and leaves any remaining conflicts for the next sync.
- **Finding changes.** The client keeps, per record, what the server is known to hold. A local record that differs from that is uploaded; a record that is gone locally is uploaded as a deletion. A deletion is never applied to a setting, in either direction.

## When two devices changed the same thing

- **Diary entries** are merged. Mood and text are handled separately, so a mood set on one device and text written on another are both kept. If the text changed on both devices, both versions are kept, the newer one first, separated by a horizontal rule; when the whole of one version appears inside the other, the longer one is kept and nothing is stacked. An edit wins over a deletion.
- **Everything else** keeps the version that changed last. A setting or a deletion counts as changed at the moment it is synced.
