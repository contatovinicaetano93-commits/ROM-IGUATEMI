// Local scripts (tsx) — stub `server-only` so sync can run outside Next.js.
const Module = require('module')
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'server-only') return {}
  return originalLoad(request, parent, isMain)
}
