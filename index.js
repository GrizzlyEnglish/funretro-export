// File system for loading files
const fs = require('fs');
// The current path
const path = require('path');
// Playwrit instance
const { chromium } = require('playwright');
// Settings for determining how playwrite will grab the data from selectors
const settings = JSON.parse(fs.readFileSync('./settings.json', 'utf8'));
// Setup the arguments utilizing yargs
const argv = require('yargs')
  .command('$0 <url>', 'Exports data from a easy retro board url')
  .option('filePath', {
      alias: 'f',
      description: 'The path to save the file',
      default: './',
      type: 'string',
  })
  .option('fileType', {
      alias: 't',
      description: 'The type of file to export the board data to',
      default: 'txt',
      type: 'string',
  })
  .help()
  .alias('help', 'h')
  .argv;

// MUST have a url verify
if (!argv.url) {
  throw 'Please provide a URL as the first argument.';
}

/**
 * Start the exportation of easy retro board
 */
async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Go to the given url
  await page.goto(argv.url);
  // Verify that a container is visible before continueing
  await page.waitForSelector(settings.selectors.messageContainer);

  // Grab the name of the board
  const boardTitle = await page.$eval(settings.selectors.boardTitleIdentifier, (node) => node.innerText.trim());

  if (!boardTitle) {
    throw 'Board title does not exist. Please check if provided URL is correct.'
  }

  const columns = await page.$$(settings.selectors.messageColumn);

  // First evaluate all the necessary data
  let eval_columns = [];

  for (let i = 0; i < columns.length; i++) {
    const columnTitle = await columns[i].$eval(settings.selectors.columnHeader, (node) => node.innerText.trim());
    const messages = await columns[i].$$(settings.selectors.messageContainer);

    let eval_messages = [];

    for (let i = 0; i < messages.length; i++) {
      const votes = await messages[i].$eval(settings.selectors.messageVotes, (node) => parseInt(node.innerText.trim()));
      
      // Only get votes that matches the settings
      if (votes >= settings.voteCount) {
        const messageText = await messages[i].$eval(settings.selectors.messageText, (node) => node.innerText.trim());
        eval_messages.push({
          text: messageText,
          voteCount: votes
        });
      }
    }

    eval_columns.push({
      columnTitle,
      messages: eval_messages
    });
  }

  // Then parse the data
  let data;
  switch (argv.fileType) {
    case "txt":
      data = await parseTextFile(boardTitle, eval_columns);
      break;
    case "csv":
      data = await parseCSV(eval_columns);
      break;
    default:
      throw 'File type is not supported, currently supports .txt and .csv';
  }

  return [data, boardTitle];
}

/**
 * Parses out the columns into a single text file
 * Example:
 *    Board Title
 * 
 *    Column Title
 *    - Message
 * 
 * @param {String} boardTitle - The title of the board being parsed
 * @param {Array} columnData - An array of columns
 * @returns {String} - The parsed txt format of the column data
 */
async function parseTextFile(boardTitle, columnData) {
  let parsedText = `${boardTitle} \n\n`;

  for (let i = 0; i < columnData.length; i++) {
    const columnTitle = columnData[i].columnTitle;
    const messages = columnData[i].messages;

    if (messages.length) {
      parsedText += `${columnTitle} \n`;
    }

    for (let m = 0; m < messages.length; m++) {
      const message = messages[m];
      parsedText += `- ${message.text} (${message.voteCount}) \n`;
    }

    if (messages.length) {
      parsedText += '\n';
    }
  }

  return parsedText;
}

/**
 * Export the array of columns into a csv format
 * Column 1, Column 2,
 * Row 1, Row 2
 * Ect.
 * @param {Array} columnData - An array of columns and its messages
 * @returns {String} - The parsed csv format of the data
 */
async function parseCSV(columnData) {
  let parsedText = '';
  // Loop through and generate a csv, get the max row + 1 for columns header
  let max_rows = Math.max.apply(Math, columnData.map(col => col.messages.length)) + 1;
  for (let i = 0; i < max_rows; i++) {
    for (let colNum = 0; colNum < columnData.length; colNum++) {
      if (i == 0) {
        // This one is special get the column headers
        parsedText += `${columnData[colNum].columnTitle},`;
      } else {
        // Get the messages at the row
        const message = columnData[colNum].messages[i - 1];
        if (message === undefined) {
          parsedText += ','
        } else {
          parsedText += `${message.text} (${message.voteCount}),`;
        }
      }
    }

    // New line for next "row"
    parsedText += '\r\n';
  }

  return parsedText;
}

/**
 * Writes the given data to a file path
 * @param {String} fileName - The name of the file to write
 * @param {String} data - The contents of the file to write
 */
function writeToFile(fileName, data) {
  const resolvedPath = path.resolve(`${argv.filePath}/${fileName}.${argv.fileType}`);
  fs.writeFile(resolvedPath, data, (error) => {
    if (error) {
      throw error;
    } else {
      console.log(`Successfully written to file at: ${resolvedPath}`);
    }
    process.exit();
  });
}

/**
 * Writes an error to the console
 * @param {Object} error - The error object
 */
function handleError(error) {
  console.error(error);
}

// Run the export, then write to a file
run().then(([data, boardTitle]) => writeToFile(boardTitle.split(' ').join(''), data)).catch(handleError);
