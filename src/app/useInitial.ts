import { use, useEffect } from 'react'

interface Load {
  promise: Promise<unknown>
  held: boolean
}

const loads = new WeakMap<object, Map<string, Load>>()

/**
 * A page's first data, read through Suspense. Navigations run as transitions, so the old page stays on screen
 * until the new one can draw complete, instead of flashing an empty frame between them.
 *
 * A load is kept per source (a repository) and key only while a page holds it, so the next visit reads fresh data;
 * one that no page took up (a navigation abandoned midway) is dropped shortly after it settles.
 * Later changes still reach the page through its own watch.
 */
export function useInitial<T>(source: object, key: string, load: () => Promise<T>): T {
  let byKey = loads.get(source)
  if (!byKey) loads.set(source, (byKey = new Map()))
  const map = byKey
  let entry = map.get(key)
  if (!entry) {
    const created: Load = { promise: load(), held: false }
    const drop = () => setTimeout(() => !created.held && map.get(key) === created && map.delete(key), 2000)
    created.promise.then(drop, drop)
    map.set(key, (entry = created))
  }
  const held = entry
  useEffect(() => {
    held.held = true
    map.set(key, held)
    return () => {
      held.held = false
      if (map.get(key) === held) map.delete(key)
    }
  }, [map, key, held])
  return use(held.promise as Promise<T>)
}
