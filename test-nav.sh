#!/bin/bash
# Usage: ./test-nav.sh <module-name>
# Sets the active module via Zustand store JavaScript eval
MODULE="${1:-dashboard}"
agent-browser eval "(function() {
  const rootEl = document.body;
  const fiberKey = Object.keys(rootEl).find(k => k.startsWith('__reactContainer') || k.startsWith('__reactFiber'));
  let fiber = rootEl[fiberKey];
  let store = null;
  function walk(f, depth) {
    if (!f || depth > 50) return;
    if (f.memoizedState) {
      let s = f.memoizedState;
      while (s) {
        try {
          if (s.memoizedState && typeof s.memoizedState === 'object' && s.memoizedState !== null) {
            const v = s.memoizedState;
            if (v.activeItem !== undefined && v.setActiveItem) { store = v; return; }
          }
        } catch(e){}
        s = s.next;
      }
    }
    walk(f.child, depth+1);
    if (!store) walk(f.sibling, depth+1);
  }
  walk(fiber, 0);
  if (store) {
    store.setActiveItem('${MODULE}');
    return JSON.stringify({ok: true, active: store.activeItem});
  }
  return JSON.stringify({ok: false});
})()" 2>&1 | tail -1
