'use strict';
// "Build a real thing": programs you run and use, built a milestone at a
// time, in C, C++ or Rust. The tests are the same for every language: they
// run your program the way a person would (arguments, typed input, files in
// the folder) and check what it prints, its exit code and the files it
// leaves. Each test runs in a fresh, empty folder with the files it lists.
//
// A test: { name, files: { 'a.txt': '...' }, run: [ { args, stdin, out, code,
//   err (true: something on stderr), errHas (text stderr must contain),
//   outHas } ], after: { 'file': 'content it must have at the end' } }
// out is compared like a judge: trailing spaces and the last newline don't
// matter. code defaults to 0.

const T = (name, run, extra = {}) => ({ name, run: Array.isArray(run) ? run : [run], ...extra });

module.exports = [
  // ================================================================== count
  {
    id: 'count', name: 'count', title: 'count: your own word counter',
    blurb: 'A command-line tool like Unix wc: lines, words and bytes, from typed input or from files, with options and proper errors.',
    skills: ['reading input', 'command-line arguments', 'files', 'exit codes'],
    milestones: [
      {
        title: 'Count the lines',
        brief: '`count -l` reads everything typed on standard input (until the end of input) and prints how many lines there were: the number of newline characters. (The other options come later; for now, `-l` is the only one.) Try it in the terminal: `echo hi | ./count -l`, or run it and type, then press Ctrl+D (Ctrl+Z then Enter on Windows).',
        hints: {
          c: ['Read one character at a time: `int ch; while ((ch = getchar()) != EOF) { ... }`. `ch` is an int, not a char, so EOF fits.', 'Count the `\'\\n\'` characters. Print with `printf("%ld\\n", lines);`'],
          cpp: ['`char ch; while (std::cin.get(ch)) { ... }` reads every character, spaces and newlines included.', 'Count the `\'\\n\'` characters, then `std::cout << lines << \'\\n\';`'],
          rust: ['Read everything at once: `let mut text = Vec::new(); std::io::stdin().read_to_end(&mut text)?;` (with `use std::io::Read;`). Bytes, so any input works.', '`text.iter().filter(|&&b| b == b\'\\n\').count()`'],
        },
        tests: [
          T('three lines', { args: ['-l'], stdin: 'one\ntwo\nthree\n', out: '3' }),
          T('nothing typed', { args: ['-l'], stdin: '', out: '0' }),
          T('a last line with no newline isn\'t counted (like wc)', { args: ['-l'], stdin: 'a\nb', out: '1' }),
          T('empty lines count', { args: ['-l'], stdin: '\n\n\n\n', out: '4' }),
        ],
      },
      {
        title: 'Words and bytes',
        brief: 'With no options, print three numbers, separated by one space: lines, words and bytes. A word is a run of characters that aren\'t whitespace (space, tab, newline, carriage return). Bytes, not letters: `é` is two bytes in UTF-8. `hello world\\nbye\\n` gives `2 3 16`.',
        hints: {
          c: ['Keep a flag `in_word`. At each character: if it\'s whitespace (`isspace(ch)`, from <ctype.h>), `in_word = 0`; otherwise, if `!in_word`, it starts a word: count it and set `in_word = 1`.', 'Every character read is one byte: count them all.'],
          cpp: ['The same idea as C: a bool `inWord`, and `std::isspace(static_cast<unsigned char>(ch))`. The cast matters: a negative char is undefined behaviour in isspace.'],
          rust: ['`text.len()` is the bytes. For words: `text.split(|b| b.is_ascii_whitespace()).filter(|w| !w.is_empty()).count()`'],
        },
        tests: [
          T('two lines, three words', { stdin: 'hello world\nbye\n', out: '2 3 16' }),
          T('nothing', { stdin: '', out: '0 0 0' }),
          T('runs of spaces and tabs are one gap', { stdin: '  a \t b  \n', out: '1 2 10' }),
          T('bytes, not letters', { stdin: 'café\n', out: '1 1 6' }),
        ],
      },
      {
        title: 'Files',
        brief: 'The arguments are file names. Print one line per file: the three numbers, then the file name. With more than one file, finish with a `total` line. With no arguments, read standard input as before (no name printed).',
        hints: {
          c: ['Move the counting into a function that takes a `FILE *` and fills in three counts. Call it with `stdin`, or with each file from `fopen(argv[i], "rb")`. Close each file.'],
          cpp: ['A function that takes `std::istream&` works for `std::cin` and for a `std::ifstream` alike. Open with `std::ifstream in(name, std::ios::binary);`'],
          rust: ['`std::fs::read(name)` gives a file\'s bytes, the same `Vec<u8>` as stdin. Arguments: `std::env::args().skip(1)`.'],
        },
        tests: [
          T('one file', { args: ['notes.txt'], out: '2 4 18 notes.txt' }, { files: { 'notes.txt': 'buy milk\ncall Sam\n' } }),
          T('two files and a total', { args: ['a.txt', 'b.txt'], out: '1 1 2 a.txt\n2 2 4 b.txt\n3 3 6 total' }, { files: { 'a.txt': 'x\n', 'b.txt': 'y\nz\n' } }),
          T('no files: standard input', { stdin: 'one two\n', out: '1 2 8' }),
        ],
      },
      {
        title: 'Options',
        brief: 'Options choose which numbers to show: `-l` lines, `-w` words, `-c` bytes. They can be combined (`-l -w`, or `-lw`) and come before the files. The numbers always come in the order lines, words, bytes. No option means all three. An unknown option prints `count: unknown option -x` on standard error and exits with code 2.',
        hints: {
          c: ['Loop over `argv` while `argv[i][0] == \'-\'`: look at each letter after the dash. Keep three flags. Print a number only if its flag is set (or no flags at all).', '`fprintf(stderr, "count: unknown option -%c\\n", c); return 2;`'],
          cpp: ['`std::string_view a = argv[i]; if (a.size() > 1 && a[0] == \'-\')`: then each letter of `a.substr(1)`.', '`std::cerr << "count: unknown option -" << c << \'\\n\'; return 2;`'],
          rust: ['Collect the args into a `Vec<String>`. While the first starts with `-`, take its letters with `.chars().skip(1)`.', '`eprintln!("count: unknown option -{c}"); std::process::exit(2);`'],
        },
        tests: [
          T('-l only', { args: ['-l', 'f.txt'], out: '3 f.txt' }, { files: { 'f.txt': 'a b\nc\nd e f\n' } }),
          T('-w and -c, in any order', { args: ['-c', '-w', 'f.txt'], out: '6 12 f.txt' }, { files: { 'f.txt': 'a b\nc\nd e f\n' } }),
          T('combined: -lw', { args: ['-lw'], stdin: 'a b\nc\n', out: '2 3' }),
          T('an unknown option', { args: ['-x', 'f.txt'], code: 2, errHas: 'unknown option -x' }, { files: { 'f.txt': 'a\n' } }),
        ],
      },
      {
        title: 'Boss: files that aren\'t there',
        brief: 'A file that can\'t be opened prints `count: NAME: can\'t open` on standard error, and `count` carries on with the other files. The total counts only the files it read. If any file failed, the exit code is 1. An empty file is fine: `0 0 0 empty.txt`.',
        hints: {
          c: ['`fopen` returns NULL when it fails: print the message to stderr, remember `status = 1`, and `continue`.'],
          cpp: ['`if (!in) { std::cerr << ...; status = 1; continue; }` right after opening the ifstream.'],
          rust: ['`match std::fs::read(name) { Ok(bytes) => ..., Err(_) => { eprintln!(...); status = 1; } }`, and `std::process::exit(status)` at the end.'],
        },
        tests: [
          T('a missing file between two good ones', { args: ['a.txt', 'nope.txt', 'b.txt'], out: '1 1 2 a.txt\n1 2 4 b.txt\n2 3 6 total', code: 1, errHas: 'nope.txt' }, { files: { 'a.txt': 'x\n', 'b.txt': 'y z\n' } }),
          T('only a missing file', { args: ['gone.txt'], out: '', code: 1, errHas: "gone.txt: can't open" }),
          T('an empty file', { args: ['empty.txt'], out: '0 0 0 empty.txt' }, { files: { 'empty.txt': '' } }),
          T('a big file', { args: ['-l', 'big.txt'], out: '100000 big.txt' }, { files: { 'big.txt': 'line of text\n'.repeat(100000) } }),
        ],
      },
    ],
  },

  // ================================================================== todo
  {
    id: 'todo', name: 'todo', title: 'todo: a to-do list you keep',
    blurb: 'A command-line to-do list that saves to a file between runs: add, list, done, remove, with errors that say what went wrong.',
    skills: ['command-line arguments', 'reading and writing files', 'parsing', 'error handling'],
    milestones: [
      {
        title: 'Add and list',
        brief: '`todo add buy milk` adds a task (the words after `add`, joined with spaces) and prints `Added 1: buy milk`. `todo list` prints each task as `1 [ ] buy milk`, or `Nothing to do.` when there are none. Tasks are kept in `todo.txt` in the current folder, so they\'re still there next time. Its first line is `next N` (the id the next task gets, starting at 1), then one line per task: the id, a tab, `[ ] ` (or `[x] ` once done) and the title. Each test runs your program several times in the same folder.',
        hints: {
          c: ['Read the whole file into an array of structs at the start (`struct task { int id; int done; char title[256]; }`), change it in memory, and write the whole file back at the end. A missing file means an empty list.', 'Parse a task line with `sscanf(line, "%d\\t[%c] %255[^\\n]", &id, &mark, title)`. Join the words with `strcat`, adding a space between them.'],
          cpp: ['A `struct Task { int id; bool done; std::string title; };` and a `std::vector<Task>`. Load at the start, save at the end.', 'Read lines with `std::getline`. Split off the id at the tab with `line.find(\'\\t\')`.'],
          rust: ['Load with `std::fs::read_to_string("todo.txt").unwrap_or_default()`: a missing file is an empty string. Save with `std::fs::write`.', '`line.split_once(\'\\t\')` gives the id and the rest; `rest.strip_prefix("[ ] ")` the title.'],
        },
        tests: [
          T('add, then list', [{ args: ['add', 'buy', 'milk'], out: 'Added 1: buy milk' }, { args: ['add', 'call', 'Sam'], out: 'Added 2: call Sam' }, { args: ['list'], out: '1 [ ] buy milk\n2 [ ] call Sam' }]),
          T('an empty list', { args: ['list'], out: 'Nothing to do.' }),
          T('the file it keeps', [{ args: ['add', 'water', 'plants'], out: 'Added 1: water plants' }], { after: { 'todo.txt': 'next 2\n1\t[ ] water plants\n' } }),
        ],
      },
      {
        title: 'Done',
        brief: '`todo done 1` marks task 1 done and prints `Done 1: buy milk`. `todo list` shows it as `1 [x] buy milk`, and the file saves `[x] `.',
        hints: { all: ['Find the task with that id, set its done flag, save. Turn the argument into a number first: `atoi`, `std::stoi` or `.parse::<u32>()`.'] },
        tests: [
          T('done shows in the list', [{ args: ['add', 'a'], out: 'Added 1: a' }, { args: ['add', 'b'], out: 'Added 2: b' }, { args: ['done', '2'], out: 'Done 2: b' }, { args: ['list'], out: '1 [ ] a\n2 [x] b' }],
            { after: { 'todo.txt': 'next 3\n1\t[ ] a\n2\t[x] b\n' } }),
          T('a file from before', [{ args: ['done', '7'], out: 'Done 7: feed cat' }, { args: ['list'], out: '3 [x] old\n7 [x] feed cat' }], { files: { 'todo.txt': 'next 8\n3\t[x] old\n7\t[ ] feed cat\n' } }),
        ],
      },
      {
        title: 'Remove, and mistakes',
        brief: '`todo rm 1` removes task 1 and prints `Removed 1: buy milk`. Mistakes go to standard error with exit code 1: `todo: no task 7`, `todo: task 1 is already done`, `todo: "x" isn\'t a task number`, `todo: a task needs a title` (for `todo add` with nothing after it). No command, or one it doesn\'t know: print `usage: todo add <title> | list | done <id> | rm <id>` on standard error, exit code 2. A mistake changes nothing in the file.',
        hints: { all: ['Check everything before changing anything. Write each error as one line on stderr, then exit with the code.', 'A number check: every character a digit, and at least one. `"12x"` isn\'t a task number.'] },
        tests: [
          T('remove', [{ args: ['add', 'a'] , out: 'Added 1: a' }, { args: ['rm', '1'], out: 'Removed 1: a' }, { args: ['list'], out: 'Nothing to do.' }]),
          T('no such task', [{ args: ['add', 'a'], out: 'Added 1: a' }, { args: ['done', '7'], code: 1, errHas: 'todo: no task 7' }, { args: ['rm', '7'], code: 1, errHas: 'todo: no task 7' }]),
          T('already done', [{ args: ['add', 'a'], out: 'Added 1: a' }, { args: ['done', '1'], out: 'Done 1: a' }, { args: ['done', '1'], code: 1, errHas: 'todo: task 1 is already done' }]),
          T('not a number', { args: ['done', '12x'], code: 1, errHas: '"12x" isn\'t a task number' }),
          T('no title', { args: ['add'], code: 1, errHas: 'a task needs a title' }),
          T('no command, or a wrong one', [{ args: [], code: 2, errHas: 'usage: todo' }, { args: ['fly'], code: 2, errHas: 'usage: todo' }]),
          T('a mistake changes nothing', [{ args: ['add', 'keep'], out: 'Added 1: keep' }, { args: ['rm', '9'], code: 1, err: true }], { after: { 'todo.txt': 'next 2\n1\t[ ] keep\n' } }),
        ],
      },
      {
        title: 'Ids, and only what\'s left',
        brief: 'Ids are never reused, even after the newest task is removed: that\'s what `next` in the file is for. `todo list --pending` shows only the tasks not done (or `Nothing to do.`).',
        hints: { all: ['Give a new task the id from `next`, then add one to `next`. Never work it out from the tasks that are left.'] },
        tests: [
          T('a removed id isn\'t handed out again', [{ args: ['add', 'a'], out: 'Added 1: a' }, { args: ['add', 'b'], out: 'Added 2: b' }, { args: ['rm', '2'], out: 'Removed 2: b' }, { args: ['add', 'c'], out: 'Added 3: c' }]),
          T('--pending', [{ args: ['add', 'a'], out: 'Added 1: a' }, { args: ['add', 'b'], out: 'Added 2: b' }, { args: ['done', '1'], out: 'Done 1: a' }, { args: ['list', '--pending'], out: '2 [ ] b' }, { args: ['done', '2'], out: 'Done 2: b' }, { args: ['list', '--pending'], out: 'Nothing to do.' }]),
        ],
      },
      {
        title: 'Boss: a mangled file',
        brief: 'Files get edited by hand and cut short. If `todo.txt` has a line that isn\'t a task (or the first line isn\'t `next N`), every command prints `todo: todo.txt line N is broken` on standard error (N counts from 1) and exits with code 1, leaving the file alone. Blank lines are fine. Titles keep their spaces exactly.',
        hints: { all: ['Check each line as you load it, counting lines. On the first bad one, print the error and exit before doing anything else.', 'A task line: digits, a tab, `[ ] ` or `[x] `, then at least one character.'] },
        tests: [
          T('a broken task line', { args: ['list'], code: 1, errHas: 'todo.txt line 3 is broken' }, { files: { 'todo.txt': 'next 3\n1\t[ ] a\nrubbish\n' }, after: { 'todo.txt': 'next 3\n1\t[ ] a\nrubbish\n' } }),
          T('no next line', { args: ['add', 'x'], code: 1, errHas: 'todo.txt line 1 is broken' }, { files: { 'todo.txt': '1\t[ ] a\n' } }),
          T('a wrong mark', { args: ['list'], code: 1, errHas: 'line 2 is broken' }, { files: { 'todo.txt': 'next 2\n1\t[?] a\n' } }),
          T('blank lines and spaces in titles are fine', [{ args: ['list'], out: '1 [ ] two  spaces' }], { files: { 'todo.txt': 'next 2\n\n1\t[ ] two  spaces\n\n' } }),
        ],
      },
    ],
  },

  // ================================================================== adventure
  {
    id: 'adventure', name: 'adventure', title: 'adventure: a text adventure',
    blurb: 'A small text adventure you play by typing: rooms, doors, things to pick up, a locked vault. Your own story once the tests pass.',
    skills: ['a game loop', 'structs and enums', 'string handling', 'state'],
    milestones: [
      {
        title: 'A room',
        brief: 'The game reads commands, one per line, from standard input, until `quit` or the end of input. It starts by printing where you are:\n\n`You are in the hall. Doors lead north and east.`\n\n`look` prints it again. `quit` prints `Bye.` and ends. Anything else prints `I don\'t understand "dance".` (with what was typed, trimmed). Print nothing else: no prompt.',
        hints: {
          c: ['`char line[256]; while (fgets(line, sizeof line, stdin)) { ... }` reads a line at a time; take the newline off with `line[strcspn(line, "\\n")] = 0;`'],
          cpp: ['`std::string line; while (std::getline(std::cin, line)) { ... }`'],
          rust: ['`for line in std::io::stdin().lines() { let line = line?; ... }`'],
        },
        tests: [
          T('look and quit', { stdin: 'look\nquit\n', out: 'You are in the hall. Doors lead north and east.\nYou are in the hall. Doors lead north and east.\nBye.' }),
          T('the end of input ends the game too', { stdin: 'look\n', out: 'You are in the hall. Doors lead north and east.\nYou are in the hall. Doors lead north and east.' }),
          T('something it doesn\'t understand', { stdin: 'dance\nquit\n', out: 'You are in the hall. Doors lead north and east.\nI don\'t understand "dance".\nBye.' }),
        ],
      },
      {
        title: 'Moving',
        brief: 'Four rooms:\n\n- hall: `You are in the hall. Doors lead north and east.` North: library. East: garden.\n- library: `You are in the library. Dusty books everywhere. Doors lead north and south.` South: hall. North: the vault (locked: `The vault door is locked.`).\n- garden: `You are in the garden. A path leads west.` West: hall.\n\n`go north` (also `go south`, `go east`, `go west`, or just `n`, `s`, `e`, `w`) moves and prints the new room. A way that isn\'t there: `You can\'t go that way.`',
        hints: {
          c: ['An enum of rooms, and a function `int exit_to(int room, char dir)` with a switch, returning the room, -1 for no way, or -2 for the locked door.'],
          cpp: ['An `enum class Room { Hall, Library, Garden, Vault };` and a `std::map<std::pair<Room, char>, Room>` of the ways between them.'],
          rust: ['`enum Room { Hall, Library, Garden, Vault }` and `fn go(room: Room, dir: char) -> Option<Room>`, with a `match (room, dir)`.'],
        },
        tests: [
          T('around the house', { stdin: 'go north\ns\ne\ngo west\nquit\n', out: 'You are in the hall. Doors lead north and east.\nYou are in the library. Dusty books everywhere. Doors lead north and south.\nYou are in the hall. Doors lead north and east.\nYou are in the garden. A path leads west.\nYou are in the hall. Doors lead north and east.\nBye.' }),
          T('no way through', { stdin: 'w\ne\ne\nquit\n', out: 'You are in the hall. Doors lead north and east.\nYou can\'t go that way.\nYou are in the garden. A path leads west.\nYou can\'t go that way.\nBye.' }),
          T('the vault is locked', { stdin: 'n\nn\nquit\n', out: 'You are in the hall. Doors lead north and east.\nYou are in the library. Dusty books everywhere. Doors lead north and south.\nThe vault door is locked.\nBye.' }),
        ],
      },
      {
        title: 'Things',
        brief: 'There\'s a key in the garden and a lamp in the library. `look` now also says what\'s there: after the room\'s sentence, `You see: a key.` (or `You see: a lamp.`, or `You see: a key, a lamp.` in the order they were put there). Walking in still prints only the sentence. `take key` prints `Taken: key.`; if it isn\'t there, `There is no key here.` `drop key` prints `Dropped: key.` and leaves it in the room (or `You don\'t have a key.`). `inventory` (or `i`) prints `You carry: key, lamp.` in the order you took them, or `You carry nothing.`',
        hints: { all: ['Keep where each thing is: in a room, or carried. Carried things need an order, so keep a list.', 'look prints two parts now: the room\'s sentence, and the "You see" line when something is there. Each room keeps a list of what\'s in it, so a dropped key shows up.'] },
        tests: [
          T('take the key', { stdin: 'e\nlook\ntake key\nlook\ni\nquit\n', out: 'You are in the hall. Doors lead north and east.\nYou are in the garden. A path leads west.\nYou are in the garden. A path leads west.\nYou see: a key.\nTaken: key.\nYou are in the garden. A path leads west.\nYou carry: key.\nBye.' }),
          T('two things, in order', { stdin: 'n\ntake lamp\ns\ne\ntake key\ninventory\nquit\n', out: 'You are in the hall. Doors lead north and east.\nYou are in the library. Dusty books everywhere. Doors lead north and south.\nTaken: lamp.\nYou are in the hall. Doors lead north and east.\nYou are in the garden. A path leads west.\nTaken: key.\nYou carry: lamp, key.\nBye.' }),
          T('drop it somewhere else', { stdin: 'e\ntake key\nw\ndrop key\nlook\ndrop key\ni\nn\nlook\nquit\n', out: 'You are in the hall. Doors lead north and east.\nYou are in the garden. A path leads west.\nTaken: key.\nYou are in the hall. Doors lead north and east.\nDropped: key.\nYou are in the hall. Doors lead north and east.\nYou see: a key.\nYou don\'t have a key.\nYou carry nothing.\nYou are in the library. Dusty books everywhere. Doors lead north and south.\nYou are in the library. Dusty books everywhere. Doors lead north and south.\nYou see: a lamp.\nBye.' }),
          T('nothing to take', { stdin: 'take key\nquit\n', out: 'You are in the hall. Doors lead north and east.\nThere is no key here.\nBye.' }),
        ],
      },
      {
        title: 'The vault',
        brief: 'Going north from the library with the key prints `You unlock the vault door with the key.`, then `You are in the vault. Gold everywhere!` and `You win!`, and the game ends (exit code 0). Without the key, it\'s still locked.',
        hints: { all: ['In the move: if it\'s the vault door and you carry the key, unlock it, move, print the three lines and stop the loop.'] },
        tests: [
          T('win', { stdin: 'e\ntake key\nw\nn\nn\nlook\n', out: 'You are in the hall. Doors lead north and east.\nYou are in the garden. A path leads west.\nTaken: key.\nYou are in the hall. Doors lead north and east.\nYou are in the library. Dusty books everywhere. Doors lead north and south.\nYou unlock the vault door with the key.\nYou are in the vault. Gold everywhere!\nYou win!' }),
          T('no key, no gold', { stdin: 'n\nn\nquit\n', out: 'You are in the hall. Doors lead north and east.\nYou are in the library. Dusty books everywhere. Doors lead north and south.\nThe vault door is locked.\nBye.' }),
        ],
      },
      {
        title: 'Boss: people don\'t type neatly',
        brief: 'Commands work in any case and with extra spaces: `  GO   North ` is `go north`. Blank lines are ignored. `go` alone prints `Go where?`; `take` alone, `Take what?`; `drop` alone, `Drop what?`. A very long line is just something it doesn\'t understand.',
        hints: { all: ['Tidy each line first: lowercase it, then split it into words (any amount of whitespace between them). Then match on the words.', 'Don\'t put a long line in a fixed-size buffer without a limit: fgets with a size, or a growing string.'] },
        tests: [
          T('messy typing', { stdin: '\n  GO   East \n\nTAKE Key\n  I\nQUIT\n', out: 'You are in the hall. Doors lead north and east.\nYou are in the garden. A path leads west.\nTaken: key.\nYou carry: key.\nBye.' }),
          T('half a command', { stdin: 'go\ntake\ndrop\nquit\n', out: 'You are in the hall. Doors lead north and east.\nGo where?\nTake what?\nDrop what?\nBye.' }),
          T('a very long line', { stdin: `${'x'.repeat(5000)}\nquit\n`, outHas: 'I don\'t understand', code: 0 }),
        ],
      },
    ],
  },

  // ================================================================== kv
  {
    id: 'kv', name: 'kv', title: 'kv: a key-value store on disk',
    blurb: 'A tiny database: set, get, delete and list keys, saved as an append-only log (the way real databases write), with compaction and corruption checks.',
    skills: ['files', 'maps', 'append-only logs', 'validation'],
    milestones: [
      {
        title: 'set and get',
        brief: '`kv set name Ana Lovelace` saves a value (the words after the key, joined with spaces) and prints nothing. `kv get name` prints `Ana Lovelace`. A key that isn\'t there: `kv: no key "name"` on standard error, exit code 1. The data is in `kv.db` in the current folder, as a log: `set` adds a line `set`, a tab, the key, a tab, the value, at the end of the file. Nothing is ever changed in place: setting a key again adds another line, and the last one wins.',
        hints: {
          c: ['Append with `fopen("kv.db", "a")`. For get, read every line and remember the value of the last `set` for that key.'],
          cpp: ['Append with `std::ofstream out("kv.db", std::ios::app);`. For get, read the log into a `std::map<std::string, std::string>`: later lines overwrite earlier ones.'],
          rust: ['Append with `OpenOptions::new().create(true).append(true).open("kv.db")`. Replay the log into a `BTreeMap<String, String>`.'],
        },
        tests: [
          T('set then get', [{ args: ['set', 'name', 'Ana', 'Lovelace'], out: '' }, { args: ['get', 'name'], out: 'Ana Lovelace' }], { after: { 'kv.db': 'set\tname\tAna Lovelace\n' } }),
          T('the last set wins', [{ args: ['set', 'x', '1'] }, { args: ['set', 'x', '2'] }, { args: ['get', 'x'], out: '2' }], { after: { 'kv.db': 'set\tx\t1\nset\tx\t2\n' } }),
          T('a missing key', { args: ['get', 'nope'], code: 1, errHas: 'kv: no key "nope"' }),
        ],
      },
      {
        title: 'del and list',
        brief: '`kv del name` adds a line `del`, a tab, the key, and prints nothing; afterwards the key isn\'t there. Deleting a key that isn\'t there: `kv: no key "name"`, exit code 1, nothing added. `kv list` prints every key that\'s there as `key=value`, sorted by key.',
        hints: { all: ['Replaying the log: `set` puts a key in the map, `del` takes it out. Then list is just the map in order.'] },
        tests: [
          T('delete', [{ args: ['set', 'a', '1'] }, { args: ['del', 'a'] }, { args: ['get', 'a'], code: 1, errHas: 'no key "a"' }], { after: { 'kv.db': 'set\ta\t1\ndel\ta\n' } }),
          T('list, sorted', [{ args: ['set', 'b', '2'] }, { args: ['set', 'a', 'one'] }, { args: ['set', 'c', '3'] }, { args: ['del', 'c'] }, { args: ['list'], out: 'a=one\nb=2' }]),
          T('delete what isn\'t there', [{ args: ['del', 'ghost'], code: 1, errHas: 'no key "ghost"' }], { after: { 'kv.db': null } }),
        ],
      },
      {
        title: 'Mistakes',
        brief: 'A key can\'t be empty or contain `=`, a tab or a space: `kv: bad key`, exit code 1. A value can\'t contain a tab or a newline: `kv: bad value`, exit code 1. A wrong command, or the wrong number of words: `usage: kv set <key> <value> | get <key> | del <key> | list | compact` on standard error, exit code 2. A mistake writes nothing.',
        hints: { all: ['Check the command and its word count first (usage), then the key, then the value, and only then write.'] },
        tests: [
          T('bad keys', [{ args: ['set', 'a=b', '1'], code: 1, errHas: 'bad key' }, { args: ['set', 'a\tb', '1'], code: 1, errHas: 'bad key' }, { args: ['set', '', '1'], code: 1, errHas: 'bad key' }]),
          T('a bad value', { args: ['set', 'k', 'one\ttwo'], code: 1, errHas: 'bad value' }, { after: { 'kv.db': null } }),
          T('usage', [{ args: [], code: 2, errHas: 'usage: kv' }, { args: ['get'], code: 2, errHas: 'usage: kv' }, { args: ['set', 'k'], code: 2, errHas: 'usage: kv' }, { args: ['frob'], code: 2, errHas: 'usage: kv' }]),
        ],
      },
      {
        title: 'Compact',
        brief: 'A log only grows. `kv compact` rewrites `kv.db` with one `set` line per key that\'s there, sorted by key, and prints `kept N, dropped M`: N lines kept, M lines gone. Write the new file next to the old one first (`kv.db.tmp`), then rename it over: a crash halfway never loses the data.',
        hints: { all: ['Replay the log into the map, count its lines, write the map to kv.db.tmp, then rename. `rename()` in C, `std::filesystem::rename` in C++, `std::fs::rename` in Rust.'] },
        tests: [
          T('compact', [{ args: ['set', 'b', '1'] }, { args: ['set', 'a', '1'] }, { args: ['set', 'b', '2'] }, { args: ['del', 'a'] }, { args: ['set', 'c', '3'] }, { args: ['compact'], out: 'kept 2, dropped 3' }, { args: ['list'], out: 'b=2\nc=3' }],
            { after: { 'kv.db': 'set\tb\t2\nset\tc\t3\n', 'kv.db.tmp': null } }),
          T('compact an empty store', { args: ['compact'], out: 'kept 0, dropped 0' }),
        ],
      },
      {
        title: 'Boss: a damaged log',
        brief: 'If any line of `kv.db` isn\'t a well-formed `set` or `del` line, every command prints `kv: kv.db line N is broken` (N from 1) on standard error and exits with code 1, without writing. A store with 20 000 lines still answers quickly.',
        hints: { all: ['Check the line as you replay it: split at the tabs, the right number of parts for its kind, and a good key.'] },
        tests: [
          T('a broken line', [{ args: ['get', 'a'], code: 1, errHas: 'kv.db line 2 is broken' }, { args: ['set', 'z', '1'], code: 1, errHas: 'line 2 is broken' }], { files: { 'kv.db': 'set\ta\t1\nput\tb\t2\n' }, after: { 'kv.db': 'set\ta\t1\nput\tb\t2\n' } }),
          T('a set with no value', { args: ['list'], code: 1, errHas: 'line 1 is broken' }, { files: { 'kv.db': 'set\ta\n' } }),
          T('many lines', { args: ['get', 'k7'], out: 'v19997' }, { files: { 'kv.db': Array.from({ length: 20000 }, (_, i) => `set\tk${i % 10}\tv${i}\n`).join('') } }),
        ],
      },
    ],
  },

  // ================================================================== jsonq
  {
    id: 'jsonq', name: 'jsonq', title: 'jsonq: read JSON, pick out a value',
    blurb: 'A JSON parser written by hand, and a query tool on top: jsonq .users[0].name < data.json. Recursion, careful parsing and errors on bad input.',
    skills: ['recursive parsing', 'trees', 'strings and escapes', 'untrusted input'],
    milestones: [
      {
        title: 'Plain values',
        brief: '`jsonq .` reads a JSON document from standard input and prints it back in compact form, on one line. This milestone: a single number, string, `true`, `false` or `null`, maybe with spaces around it. Numbers print exactly as written (`-3.5e2` stays `-3.5e2`). Strings print with their quotes.',
        hints: { all: ['Write a parser that looks at one character at a time, with a position: skip whitespace, then decide by the character: `"` a string, `t`/`f`/`n` a word, `-` or a digit a number.', 'For this milestone a string can be copied as it is, quotes and all; escapes come later.'] },
        tests: [
          T('a number', { args: ['.'], stdin: ' 42 \n', out: '42' }),
          T('a number as written', { args: ['.'], stdin: '-3.5e2', out: '-3.5e2' }),
          T('a string', { args: ['.'], stdin: '"hello world"', out: '"hello world"' }),
          T('true, false and null', [{ args: ['.'], stdin: 'true', out: 'true' }, { args: ['.'], stdin: 'false', out: 'false' }, { args: ['.'], stdin: '\n null\n', out: 'null' }]),
        ],
      },
      {
        title: 'Arrays and objects',
        brief: 'Arrays `[1, 2, [3]]` and objects `{"a": 1, "b": [true]}`, nested any way. Print them compact: no spaces, `[1,2,[3]]`, `{"a":1,"b":[true]}`. Keys keep their order.',
        hints: {
          c: ['A tree of nodes: `struct node { int kind; char *text; struct node **items; char **keys; size_t n; };` Parse recursively: a value is a scalar, or `[` values `,` ... `]`, or `{` string `:` value ... `}`.'],
          cpp: ['`struct Value { enum Kind {...} kind; std::string text; std::vector<Value> items; std::vector<std::pair<std::string, Value>> fields; };` A vector of pairs keeps the keys in order.'],
          rust: ['`enum Value { Scalar(String), Array(Vec<Value>), Object(Vec<(String, Value)>) }` and a recursive `fn parse_value(&mut self) -> Result<Value, String>`.'],
        },
        tests: [
          T('an array', { args: ['.'], stdin: '[1, 2, [3]]', out: '[1,2,[3]]' }),
          T('an object', { args: ['.'], stdin: '{ "a" : 1, "b": [true, null] }', out: '{"a":1,"b":[true,null]}' }),
          T('empty ones', { args: ['.'], stdin: '{"x": [], "y": {}}', out: '{"x":[],"y":{}}' }),
          T('spread over lines', { args: ['.'], stdin: '{\n  "name": "Ana",\n  "langs": [\n    "C",\n    "Rust"\n  ]\n}\n', out: '{"name":"Ana","langs":["C","Rust"]}' }),
        ],
      },
      {
        title: 'Paths',
        brief: 'The argument picks a value: `.` is everything, `.name` a key of an object, `[0]` an item of an array, chained: `.users[1].name`. A key that isn\'t there, an index past the end, or a key asked of something that isn\'t an object: a message on standard error, exit code 1.',
        hints: { all: ['Parse the path into steps first (a key, or an index), then walk down the tree one step at a time.'] },
        tests: [
          T('a key', { args: ['.name'], stdin: '{"name": "Ana", "age": 36}', out: '"Ana"' }),
          T('down the tree', { args: ['.users[1].langs[0]'], stdin: '{"users": [{"name": "Ana", "langs": ["C"]}, {"name": "Ben", "langs": ["Rust", "C++"]}]}', out: '"Rust"' }),
          T('a whole piece', { args: ['.users[0]'], stdin: '{"users": [{"name": "Ana", "langs": ["C"]}]}', out: '{"name":"Ana","langs":["C"]}' }),
          T('top-level array', { args: ['[2]'], stdin: '[10, 20, 30]', out: '30' }),
          T('not there', [{ args: ['.nope'], stdin: '{"a": 1}', code: 1, err: true }, { args: ['[5]'], stdin: '[1]', code: 1, err: true }, { args: ['.a.b'], stdin: '{"a": 1}', code: 1, err: true }]),
        ],
      },
      {
        title: 'Escapes',
        brief: 'Strings can hold escapes: `\\"`, `\\\\`, `\\/`, `\\n`, `\\t`, `\\r`, `\\b`, `\\f` and `\\uXXXX` (including a surrogate pair for characters like 😀). Decode them, then print the string again with JSON\'s escapes: `\\"`, `\\\\`, `\\n`, `\\t`, `\\r`, `\\b`, `\\f`, any other control character as `\\u00XX` (lowercase hex), and everything else, é and 😀 included, as UTF-8. Keys too.',
        hints: { all: ['Keep strings decoded inside (real characters), and escape them only when printing.', 'A \\u escape gives a number; above 0x7f it becomes 2, 3 or 4 bytes of UTF-8. `\\uD83D\\uDE00` is one character: 0x10000 + ((high - 0xD800) << 10) + (low - 0xDC00).'] },
        tests: [
          T('the simple escapes', { args: ['.'], stdin: '"say \\"hi\\"\\n\\ttab\\\\ \\/"', out: '"say \\"hi\\"\\n\\ttab\\\\ /"' }),
          T('\\u escapes become UTF-8', { args: ['.'], stdin: '"caf\\u00e9 \\ud83d\\ude00"', out: '"café 😀"' }),
          T('control characters', { args: ['.'], stdin: '"a\\u0001b"', out: '"a\\u0001b"' }),
          T('escaped keys', { args: ['.k\u00e9y'], stdin: '{"k\\u00e9y": 1}', out: '1' }),
        ],
      },
      {
        title: 'Boss: bad JSON',
        brief: 'Input that isn\'t valid JSON prints `jsonq: bad JSON` (and where, if you like) on standard error, exit code 2. Trailing commas, a missing quote or bracket, two values, a bare word, a raw newline inside a string, leading zeros (`012`)... and nesting deeper than 1000 levels is refused rather than crashing.',
        hints: { all: ['Every place the parser expects something, check it\'s there; at the end, only whitespace may be left.', 'Recursion uses the stack: count the depth, and stop at 1000. Ten thousand `[` in a row would crash a parser that doesn\'t.'] },
        tests: [
          T('trailing comma', { args: ['.'], stdin: '[1, 2,]', code: 2, errHas: 'bad JSON' }),
          T('unfinished', [{ args: ['.'], stdin: '{"a": 1', code: 2, errHas: 'bad JSON' }, { args: ['.'], stdin: '"no end', code: 2, errHas: 'bad JSON' }, { args: ['.'], stdin: '', code: 2, errHas: 'bad JSON' }]),
          T('extra after the value', { args: ['.'], stdin: '1 2', code: 2, errHas: 'bad JSON' }),
          T('words and numbers JSON doesn\'t have', [{ args: ['.'], stdin: 'nul', code: 2, errHas: 'bad JSON' }, { args: ['.'], stdin: '012', code: 2, errHas: 'bad JSON' }, { args: ['.'], stdin: '1.', code: 2, errHas: 'bad JSON' }, { args: ['.'], stdin: "{'a': 1}", code: 2, errHas: 'bad JSON' }]),
          T('a newline inside a string', { args: ['.'], stdin: '"a\nb"', code: 2, errHas: 'bad JSON' }),
          T('very deep', [{ args: ['.'], stdin: '['.repeat(100000), code: 2, errHas: 'bad JSON' }, { args: ['.'], stdin: `${'['.repeat(500)}${']'.repeat(500)}`, out: `${'['.repeat(500)}${']'.repeat(500)}` }]),
        ],
      },
    ],
  },

  // ================================================================== ports: a working C program, again in C++ or Rust
  // port: the original C file (server/tracks/<id>/original.c) is shown on the
  // page, and the same tests check that your version behaves exactly like it.
  {
    id: 'port-caesar', name: 'caesar', title: 'Port it: a Caesar cipher', port: 'c', langs: ['cpp', 'rust'],
    blurb: 'A small C tool that shifts letters round the alphabet. Write it again in C++ or Rust so it behaves exactly the same: same output, same errors, same exit codes.',
    skills: ['arguments', 'parsing a number safely', 'bytes and chars'],
    milestones: [{
      title: 'Behave exactly like the C version',
      brief: 'Read the C program above until you could explain each line, then write it again in your language: the way that language would do it, not line by line. `caesar 3` shifts every letter 3 places (Z wraps round to C), keeps capitals capital, and leaves everything else (spaces, digits, é) alone. A shift that isn\'t a number, or a missing one, is an error with exit code 2.',
      hints: {
        cpp: ['Parse the shift with `std::from_chars`: it says exactly where it stopped, and never throws.', 'Keep the shift in 0..25 with `((shift % 26) + 26) % 26`: `%` of a negative number is negative in C and C++.'],
        rust: ['`args[0].parse::<i64>()` gives a Result: `let Ok(shift) = ... else { ... }`.', '`shift.rem_euclid(26)` is always 0..25, even for negative numbers: Rust\'s `%` keeps the sign like C\'s.', 'Work on bytes (`read_to_end`), not chars: a byte that isn\'t an ASCII letter goes through unchanged.'],
      },
      tests: [
        T('shift by 3', { args: ['3'], stdin: 'Hello, World!\n', out: 'Khoor, Zruog!' }),
        T('wrap round the end', { args: ['1'], stdin: 'xyz XYZ\n', out: 'yza YZA' }),
        T('a negative shift undoes it', { args: ['-3'], stdin: 'Khoor, Zruog!\n', out: 'Hello, World!' }),
        T('a big shift', { args: ['55'], stdin: 'abc\n', out: 'def' }),
        T('everything else unchanged', { args: ['5'], stdin: '123 café ?!\n', out: '123 hfké ?!' }),
        T('not a number', [{ args: ['three'], stdin: 'x', code: 2, errHas: 'must be a number' }, { args: ['3x'], stdin: 'x', code: 2, err: true }, { args: [], stdin: 'x', code: 2, errHas: 'usage' }]),
      ],
    }],
  },
  {
    id: 'port-stats', name: 'stats', title: 'Port it: number statistics', port: 'c', langs: ['cpp', 'rust'],
    blurb: 'A C program with a hand-grown array (realloc), qsort and a careful comparison function. In C++ or Rust most of that bookkeeping disappears: see how much.',
    skills: ['growing arrays', 'sorting', 'floating point output'],
    milestones: [{
      title: 'Behave exactly like the C version',
      brief: 'Read whole numbers from standard input and print `count`, `min`, `max`, `mean` (2 decimals) and `median` (1 decimal), one per line, exactly as the C version does. No numbers: just `count 0`. Something that isn\'t a whole number: `stats: that isn\'t a whole number` on standard error, exit code 1.',
      hints: {
        cpp: ['`std::vector<long>` replaces the malloc/realloc/free; `std::sort` replaces qsort and its comparison function.', 'After `while (std::cin >> x)` stops, `std::cin.eof()` tells you whether it was the end of input or something that wasn\'t a number.', '`std::printf("%.2f")` matches C\'s output exactly; with streams use `std::fixed << std::setprecision(2)`.'],
        rust: ['`input.split_whitespace()` and `w.parse::<i64>()` for each word.', '`println!("mean {:.2}", m)` prints 2 decimals, rounded the same way as C.'],
      },
      tests: [
        T('three numbers', { stdin: '3 1 2\n', out: 'count 3\nmin 1\nmax 3\nmean 2.00\nmedian 2.0' }),
        T('an even count', { stdin: '10\n20\n30\n41\n', out: 'count 4\nmin 10\nmax 41\nmean 25.25\nmedian 25.0' }),
        T('negatives and a half median', { stdin: '-5 0 4 7\n', out: 'count 4\nmin -5\nmax 7\nmean 1.50\nmedian 2.0' }),
        T('nothing', { stdin: '', out: 'count 0' }),
        T('not a number', { stdin: '1 2 three\n', code: 1, errHas: "that isn't a whole number" }),
        T('many numbers', { stdin: Array.from({ length: 5000 }, (_, i) => String(5000 - i)).join(' '), out: 'count 5000\nmin 1\nmax 5000\nmean 2500.50\nmedian 2500.5' }),
      ],
    }],
  },
  {
    id: 'port-rpn', name: 'rpn', title: 'Port it: an RPN calculator', port: 'c', langs: ['cpp', 'rust'],
    blurb: 'A C calculator with a fixed-size array as its stack, strtok and error strings. Port it with a growable stack and a proper error type.',
    skills: ['a stack', 'tokenising', 'error values instead of strings'],
    milestones: [{
      title: 'Behave exactly like the C version',
      brief: 'Each line is an expression in reverse Polish notation: `3 4 + 2 *` is (3 + 4) × 2. Print the result, or `error: ...` with the same words as the C version (`unknown word`, `not enough numbers`, `too many numbers`, `division by zero`), and carry on with the next line. Blank lines print nothing. Division is whole-number division, like C.',
      hints: {
        cpp: ['A `std::vector<long>` as the stack: `push_back`, `back`, `pop_back`. No fixed size, so no "stack full" case.', 'Return a `std::variant<long, std::string>`, or `std::optional<long>` plus an error out-parameter, instead of C\'s string-or-NULL.'],
        rust: ['An `enum Error { UnknownWord, NotEnough, TooMany, DivByZero, Blank }` and `fn eval(line: &str) -> Result<i64, Error>`.', '`let (Some(b), Some(a)) = (stack.pop(), stack.pop()) else { return Err(Error::NotEnough) };`', '`a.checked_div(b)` is None when b is 0.'],
      },
      tests: [
        T('arithmetic', { stdin: '3 4 + 2 *\n10 3 -\n7 2 /\n-6 3 /\n', out: '14\n7\n3\n-2' }),
        T('errors, then carry on', { stdin: '1 +\n1 2 3 +\n4 0 /\n2 x *\n5 5 +\n', out: 'error: not enough numbers\nerror: too many numbers\nerror: division by zero\nerror: unknown word\n10' }),
        T('blank lines print nothing', { stdin: '\n   \n2 2 *\n', out: '4' }),
        T('a single number', { stdin: '42\n', out: '42' }),
      ],
    }],
  },
];
