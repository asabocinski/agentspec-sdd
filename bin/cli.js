#!/usr/bin/env node
import { main } from '../src/cli.js'

main(process.argv.slice(2)).catch((error) => {
  console.error(`\n  agentspec-rdd: ${error.message}\n`)
  process.exit(1)
})
