import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const output = join(tmpdir(), `visualtwin-generated-${process.pid}.ts`)
try {
  for (const [schema, generated] of [['scene.schema.json', 'generated.ts'], ['screen.schema.json', 'screen-generated.ts']]) {
    execFileSync('pnpm', ['exec', 'json2ts', '-i', `packages/schema/src/${schema}`, '-o', output], { stdio: 'inherit' })
    if (readFileSync(output, 'utf8') !== readFileSync(`packages/schema/src/${generated}`, 'utf8')) throw new Error(`${schema} 类型已过期，请执行 pnpm generate:types`)
  }
} finally {
  rmSync(output, { force: true })
}
