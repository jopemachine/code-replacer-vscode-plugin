/* eslint-disable no-unused-vars */
const vscode = require('vscode')
const path = require('path')
const findFiles = require('./findFiles')
const fs = require('fs')
const { getProperties, getInput, getQuickPick, replaceAll } = require('./util')
const { UIString } = require('./constant')
// fetch setting value from vscode's settings
// See package.json's contributes's configuration
const maxLogDisplayCnt = vscode.workspace.getConfiguration().get('Code-replacer.maxLogDisplayCnt')

/**
 * @param {vscode.ExtensionContext} context
 */

function validateTemplate (template) {
  return template.includes('->')
}

function handleBooleanFlags () {
  const flagItems = [
    'print',
    'verbose',
    'conf',
    'once',
    'no-escape',
    'overwrite',
    'excludeReg',
    'startLine',
    'endLine'
  ]

  return new Promise((resolve, reject) => {
    vscode.window
      .showQuickPick(flagItems, {
        canPickMany: true,
        placeHolder: 'Check the flags to apply.'
      })
      .then((selection) => {
        resolve(selection)
      })
  })
}

async function handleTemplate ({ usageLogPath }) {
  const usageLogs = fetchLog({ jsonPath: usageLogPath, keyName: 'template' })
  const uiButtons = [
    ...usageLogs,
    UIString.TYPE_INPUT,
    UIString.EXIT
  ]
  const template = await getQuickPick({
    items: uiButtons,
    placeHolder: 'Check template to apply.'
  })

  if (template === UIString.TYPE_INPUT) {
    return await getInput({
      placeHolder: 'Enter template.',
      validateInput: (str) => {
        if (validateTemplate(str)) {
          return null
        }
        return 'Check template form to apply.'
      }
    })
  } else if (template === UIString.EXIT) {
    return -1
  } else {
    return template
  }
}

const fetchLog = ({ jsonPath, keyName }) => {
  const logs = []
  const usageLogJson = require(jsonPath)

  let displayCnt = 0
  const maxDisplayCnt = maxLogDisplayCnt
  const keys = Object.keys(usageLogJson).reverse()
  for (const usageLogKey of keys) {
    if (
      usageLogJson[usageLogKey][keyName] &&
      !logs.includes(usageLogJson[usageLogKey][keyName]) &&
      displayCnt < maxDisplayCnt
    ) {
      logs.push(usageLogJson[usageLogKey][keyName])
      displayCnt++
    }
  }

  return logs
}

const activate = (context) => {
  const disposable = vscode.commands.registerCommand(
    'Code-replacer.entry',
    async function () {
      if (
        !vscode.window.activeTextEditor ||
        !vscode.window.activeTextEditor.document
      ) {
        vscode.window.showErrorMessage(
          'Jobs canceled. open the source file first.'
        )
        return
      }

      const currentlyOpenTabfilePath =
        vscode.window.activeTextEditor.document.fileName
      const currentlyOpenTabfileName = path.basename(currentlyOpenTabfilePath)
      const pathSep =
        process.platform === 'win32' ? path.sep + path.sep : path.sep
      const dirName =
        process.platform === 'win32'
          ? replaceAll(__dirname, '\\', '\\\\')
          : __dirname

      const codeReplacerPath = `${dirName}${pathSep}node_modules${pathSep}code-replacer${pathSep}dist`
      const binPath = `${codeReplacerPath}${pathSep}index.js`
      const envPath = `${codeReplacerPath}${pathSep}${'.env'}`
      const usageLogPath = `${codeReplacerPath}${pathSep}usageLog.json`
      const workspaceName = vscode.workspace.name
      const workspacePath = vscode.workspace.rootPath

      const csvSelectOpt = await getQuickPick({
        items: [
          UIString.FETCH_CSVS,
          UIString.ENTER_CSV_PATH,
          UIString.NO_CSV,
          UIString.EXIT
        ],
        placeHolder: 'Select a method to handle csv option'
      })

      let selectedCSV

      switch (csvSelectOpt) {
        case UIString.ENTER_CSV_PATH:
          selectedCSV = await getInput({ placeHolder: 'Enter csv file path.' })
          break
        case UIString.FETCH_CSVS: {
          const csvFiles = await findFiles({
            dir: workspacePath,
            ext: 'csv'
          })
          selectedCSV = await getQuickPick({
            items: [UIString.EXIT, ...csvFiles],
            placeHolder: 'Select your csv file or type esc to pass csv option.'
          })
        }
          break
        // selectedCSV is undefined when NO CSV is selected
        case UIString.NO_CSV:
          vscode.window.showInformationMessage('csv option is passed.')
          break
        case UIString.EXIT:
          vscode.window.showErrorMessage(UIString.EXIT)
          return
        default:
          break
      }

      const flags = {
        src: currentlyOpenTabfilePath
      }

      selectedCSV && (flags.csv = selectedCSV)
      flags.template = await handleTemplate({ usageLogPath })

      if (!flags.template) {
        vscode.window.showErrorMessage(
          'Jobs canceled. template value is required argument.'
        )
        return
      } else if (flags.template === -1) {
        vscode.window.showInformationMessage(UIString.EXIT)
        return
      } else if (!validateTemplate(flags.template)) {
        vscode.window.showErrorMessage('Wrong template value. See README.md')
        return
      }

      const booleanFlags = await handleBooleanFlags()

      if (!booleanFlags) {
        vscode.window.showInformationMessage(UIString.EXIT)
        return
      }

      for (const booleanFlag of booleanFlags.values()) {
        flags[booleanFlag] = true
      }

      if (flags.excludeReg) {
        flags.excludeReg = await getInput({ placeHolder: 'Enter excludeReg.' })
      }

      if (flags.startLine) {
        flags.startLine = await getInput({ placeHolder: 'Enter startLine.' })
      }

      if (flags.endLine) {
        flags.endLine = await getInput({ placeHolder: 'Enter endLine.' })
      }

      const terminal = vscode.window.activeTerminal
        ? vscode.window.activeTerminal
        : vscode.window.createTerminal()
      terminal.show()

      const command = `node ${binPath}`

      fs.writeFile(
        envPath,
        getProperties(flags),
        {
          encoding: 'utf8'
        },
        () => {
          terminal.sendText(command)
        }
      )
    }
  )

  context.subscriptions.push(disposable)
}

exports.activate = activate

// this method is called when your extension is deactivated
function deactivate () {}

module.exports = {
  activate,
  deactivate
}
