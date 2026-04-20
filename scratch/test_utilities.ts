import { expandPath, pathsEqual } from '../src/utils/path'
import { getPlatform } from '../src/utils/platform'
import { writeFileAtomic, copyDir, pathExists, isDirEmpty } from '../src/utils/zoneScaffolding'
import { mkdir, rm, readFile } from 'fs/promises'
import { join } from 'path'

async function runTests() {
  console.log('--- Platform & Path Tests ---')
  console.log('Platform:', getPlatform())
  console.log('Home expanded:', expandPath('~'))
  
  const p1 = '~/abc/def'
  const p2 = join(expandPath('~'), 'abc', 'def')
  console.log('Paths equal test:', pathsEqual(p1, p2))

  console.log('\n--- FS Operations Tests ---')
  const testDir = join(process.cwd(), 'scratch', 'test_zone_scaffolding')
  
  try {
    // Clean start
    if (await pathExists(testDir)) {
      await rm(testDir, { recursive: true, force: true })
    }
    await mkdir(testDir, { recursive: true })

    // Test writeFileAtomic
    const testFile = join(testDir, 'config.json')
    const content = JSON.stringify({ name: 'test-zone' }, null, 2)
    await writeFileAtomic(testFile, content)
    console.log('writeFileAtomic: Success')
    
    const readBack = await readFile(testFile, 'utf-8')
    if (readBack === content) {
      console.log('writeFileAtomic: Verification Match')
    } else {
      console.error('writeFileAtomic: VERIFICATION FAIL')
    }

    // Test copyDir
    const srcDir = join(testDir, 'src')
    const destDir = join(testDir, 'dest')
    await mkdir(srcDir)
    await writeFileAtomic(join(srcDir, 'a.txt'), 'hello')
    await mkdir(join(srcDir, 'subdir'))
    await writeFileAtomic(join(srcDir, 'subdir', 'b.txt'), 'world')
    
    await copyDir(srcDir, destDir)
    console.log('copyDir: Success')
    
    if (await pathExists(join(destDir, 'subdir', 'b.txt'))) {
      console.log('copyDir: Verification Match')
    } else {
      console.error('copyDir: VERIFICATION FAIL')
    }

    // Test isDirEmpty
    console.log('isDirEmpty(srcDir):', await isDirEmpty(srcDir))
    const emptyDir = join(testDir, 'empty')
    await mkdir(emptyDir)
    console.log('isDirEmpty(emptyDir):', await isDirEmpty(emptyDir))

  } catch (err) {
    console.error('TESTING FAILED:', err)
  } finally {
    // Cleanup
    // await rm(testDir, { recursive: true, force: true })
  }
}

runTests().catch(console.error)
