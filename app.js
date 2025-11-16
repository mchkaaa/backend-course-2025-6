const { Command } = require('commander');
const program = new Command();

program
  .version('1.0.0')
  .description('Backend Course 2025-6 Application')
  .option('-n, --name <name>', 'your name')
  .parse(process.argv);

const options = program.opts();

if (options.name) {
  console.log(`Hello, ${options.name}!`);
} else {
  console.log('Hello from backend course! Use --name to specify your name.');
}console.log("Hello from backend course!");