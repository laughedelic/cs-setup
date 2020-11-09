import * as core from '@actions/core'
import * as cli from '@actions/exec'
import * as tc from '@actions/tool-cache'
import * as path from 'path'
import * as os from 'os'

const coursierVersionSpec = `^2.0`

async function execOutput(cmd: string, ...args: string[]): Promise<string> {
  let output = ''
  const options = {
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString()
      }
    }
  }
  await cli.exec(cmd, args.filter(Boolean), options)
  return output.trim()
}

async function installCoursier(): Promise<string> {
  const csBinary = await tc.downloadTool('https://git.io/coursier-cli-linux')
  await cli.exec('chmod', ['+x', csBinary])
  const version = await execOutput(csBinary, '--version')
  const csCached = await tc.cacheFile(csBinary, 'cs', 'cs', version)
  core.addPath(csCached)
  core.info(`latest: ${tc.find('cs', coursierVersionSpec)}`)
  core.info(`all versions: ${tc.findAllVersions('cs')}`)
  return version
}

async function cs(...args: string[]): Promise<string> {
  const csCached = tc.find('cs', coursierVersionSpec)
  return execOutput(csCached, ...args)
}

async function run(): Promise<void> {
  try {
    await core.group('Install Coursier', async () => {
      const version = await installCoursier()
      core.setOutput('cs-version', version)
    })

    core.startGroup('Install JVM')
    const jvmInput = core.getInput('jvm')
    const jvmArg = jvmInput ? ['--jvm', jvmInput] : []
    if (!jvmInput && process.env.JAVA_HOME) {
      core.info(`skipping, JVM is already installed in ${process.env.JAVA_HOME}`)
    } else {
      await cs('java', ...jvmArg, '-version')
      const csJavaHome = await cs('java-home', ...jvmArg)
      core.exportVariable('JAVA_HOME', csJavaHome)
      core.addPath(path.join(csJavaHome, 'bin'))
    }
    core.endGroup()

    core.startGroup('Install Apps')
    const apps: string[] = core.getInput('apps').split(' ')
    if (apps.length) {
      const coursierBinDir = path.join(os.homedir(), 'cs-bin')
      core.exportVariable('COURSIER_BIN_DIR', coursierBinDir)
      core.addPath(coursierBinDir)
      await cs('install', 'cs', ...apps)
    }
    core.endGroup()
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
