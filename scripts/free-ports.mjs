/**
 * Release the three dev ports before `npm run dev`.
 *
 * A crashed or force-quit run can leave uvicorn, nodemon or vite holding their
 * port. The next start then fails with EADDRINUSE (or WinError 10013 on
 * Windows), and because the dev script runs all three under `concurrently -k`,
 * one stuck port takes the other two down with it — so the visible symptom is
 * "nothing starts", which reads like a broken project rather than a stale
 * process.
 *
 * Only ports this project owns are touched, and only processes actually
 * listening on them.
 */
import { execSync } from 'node:child_process'

const PORTS = [8000, 5000, 5173]
const isWindows = process.platform === 'win32'

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return '' // no matches is a normal, non-exceptional result here
  }
}

function pidsOn(port) {
  const pids = new Set()
  if (isWindows) {
    for (const line of run('netstat -ano').split(/\r?\n/)) {
      // Match the local-address column exactly, so port 5000 never matches
      // 15000 and a TIME_WAIT row (pid 0) is never killed.
      if (!/LISTENING/.test(line)) continue
      const cols = line.trim().split(/\s+/)
      const local = cols[1] || ''
      if (!local.endsWith(`:${port}`)) continue
      const pid = cols[cols.length - 1]
      if (pid && pid !== '0') pids.add(pid)
    }
  } else {
    for (const pid of run(`lsof -ti tcp:${port} -sTCP:LISTEN`).split(/\s+/)) {
      if (pid) pids.add(pid)
    }
  }
  return [...pids]
}

let freed = 0
for (const port of PORTS) {
  const pids = pidsOn(port)
  if (!pids.length) {
    console.log(`  port ${port} : free`)
    continue
  }
  for (const pid of pids) {
    // /T kills the whole tree. uvicorn --reload runs a supervisor plus a
    // worker: killing the worker alone just makes the supervisor spawn a
    // replacement, and the port comes straight back.
    run(isWindows ? `taskkill /F /T /PID ${pid}` : `kill -9 ${pid}`)
    freed++
  }
  console.log(`  port ${port} : freed (was held by ${pids.join(', ')})`)

  // Confirm it actually let go, and say so plainly if it did not, rather than
  // reporting success and leaving the next `npm run dev` to fail.
  const stubborn = pidsOn(port)
  if (stubborn.length) {
    for (const pid of stubborn) {
      run(isWindows ? `taskkill /F /T /PID ${pid}` : `kill -9 ${pid}`)
    }
    if (pidsOn(port).length) {
      console.log(`  port ${port} : WARNING — still held, kill it manually`)
    }
  }
}

if (freed) {
  // Windows takes a moment to actually release the socket after the process
  // dies; starting immediately can still hit EADDRINUSE.
  const until = Date.now() + 1500
  while (Date.now() < until) { /* brief settle */ }
}
console.log(freed ? `\nReleased ${freed} process(es).` : '\nAll ports were already free.')
