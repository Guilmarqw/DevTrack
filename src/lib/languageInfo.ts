/**
 * What each language the analyzer can report is actually for.
 *
 * The keys are exactly the names `detectLanguage` produces, so a lookup either
 * hits or falls back — there is no third state where the UI shows a stale
 * description for a renamed language.
 *
 * `role` groups a language the way a reader thinks about a stack rather than
 * the way a compiler does: CSS is "front end" even though it is not a
 * programming language, and YAML is "config" even though it appears in a
 * front-end repo.
 */
export type LanguageRole =
  | "Front end"
  | "Back end"
  | "Systems"
  | "Data"
  | "Config"
  | "Docs"
  | "Tooling";

export type LanguageFacts = {
  role: LanguageRole;
  /** One sentence: what it is and what people build with it. */
  summary: string;
};

export const LANGUAGE_INFO: Record<string, LanguageFacts> = {
  // --- front end
  HTML: {
    role: "Front end",
    summary:
      "The markup every web page is built from. It describes structure and meaning — headings, links, forms — and leaves appearance to CSS.",
  },
  CSS: {
    role: "Front end",
    summary:
      "The styling language for the web: layout, colour, type and motion. Everything a page looks like, as opposed to what it contains.",
  },
  SCSS: {
    role: "Front end",
    summary:
      "CSS with variables, nesting and reusable blocks, compiled down to plain CSS. The most common way large stylesheets stay maintainable.",
  },
  Sass: {
    role: "Front end",
    summary:
      "The original indentation-based syntax for the Sass preprocessor. Same capabilities as SCSS, written without braces or semicolons.",
  },
  Less: {
    role: "Front end",
    summary:
      "An older CSS preprocessor with variables and mixins. Still found in long-lived codebases and Bootstrap-era projects.",
  },
  JavaScript: {
    role: "Front end",
    summary:
      "The language browsers run natively, and — through Node — a great deal of server code too. The default language of the web.",
  },
  TypeScript: {
    role: "Front end",
    summary:
      "JavaScript with a type system checked before the code runs. Compiles to JavaScript, and catches whole classes of mistakes first.",
  },
  Vue: {
    role: "Front end",
    summary:
      "Single-file components that keep a template, its logic and its styles together. A gentler on-ramp than most component frameworks.",
  },
  Svelte: {
    role: "Front end",
    summary:
      "Components compiled into direct DOM updates, so there is no framework runtime shipped to the browser.",
  },
  Astro: {
    role: "Front end",
    summary:
      "A site framework that ships zero JavaScript by default and lets you opt into interactivity per component. Built for content-heavy sites.",
  },
  MDX: {
    role: "Docs",
    summary:
      "Markdown that can embed live components, so documentation can contain working examples rather than screenshots of them.",
  },

  // --- back end and general purpose
  Python: {
    role: "Back end",
    summary:
      "A readable general-purpose language that dominates data work, scripting and machine learning, and runs plenty of web back ends via Django and FastAPI.",
  },
  Ruby: {
    role: "Back end",
    summary:
      "A language designed around developer comfort. Best known for Rails, which set the template most web frameworks still follow.",
  },
  PHP: {
    role: "Back end",
    summary:
      "Purpose-built for the web and still running an enormous share of it, WordPress and Laravel included.",
  },
  Java: {
    role: "Back end",
    summary:
      "A statically typed language on the JVM, chosen for large systems that need to run for years across mixed hardware.",
  },
  Kotlin: {
    role: "Back end",
    summary:
      "A modern JVM language that is Google's preferred choice for Android, and a common replacement for Java on the server.",
  },
  Scala: {
    role: "Back end",
    summary:
      "Blends functional and object-oriented styles on the JVM. Widely used for large-scale data processing, notably with Spark.",
  },
  "C#": {
    role: "Back end",
    summary:
      "Microsoft's flagship language, on .NET. Runs web services, desktop applications and — through Unity — a large share of games.",
  },
  "F#": {
    role: "Back end",
    summary:
      "A functional-first language on .NET, favoured where correctness and data transformation matter more than object hierarchies.",
  },
  Elixir: {
    role: "Back end",
    summary:
      "Runs on the Erlang VM, built for systems that stay up: millions of lightweight processes and supervised recovery from failure.",
  },
  Erlang: {
    role: "Back end",
    summary:
      "Designed at Ericsson for telephone switches that must not go down. The concurrency and fault-tolerance model Elixir inherits.",
  },
  Clojure: {
    role: "Back end",
    summary:
      "A Lisp on the JVM built around immutable data, which makes concurrent code far easier to reason about.",
  },
  Perl: {
    role: "Tooling",
    summary:
      "Unmatched at text wrangling and still holding together a great deal of system glue and legacy automation.",
  },
  Lua: {
    role: "Tooling",
    summary:
      "A tiny language designed to be embedded. The scripting layer inside games, Redis, Neovim and network appliances.",
  },

  // --- systems
  C: {
    role: "Systems",
    summary:
      "The language operating systems are written in. Direct memory access, almost no runtime, and the ABI nearly everything else speaks.",
  },
  "C++": {
    role: "Systems",
    summary:
      "C with abstraction that costs nothing at runtime. Chosen for engines, browsers and anything where performance is the requirement.",
  },
  Rust: {
    role: "Systems",
    summary:
      "Systems performance without a garbage collector, and a compiler that rejects memory and data-race errors before the program runs.",
  },
  Go: {
    role: "Back end",
    summary:
      "Built at Google for fast compiles and easy concurrency. Compiles to a single binary, which is why so much infrastructure tooling uses it.",
  },
  Zig: {
    role: "Systems",
    summary:
      "A newer systems language aiming to replace C, with explicit allocation and no hidden control flow.",
  },
  Swift: {
    role: "Front end",
    summary:
      "Apple's language for iOS and macOS applications, and increasingly a general-purpose one on the server.",
  },
  "Objective-C": {
    role: "Front end",
    summary:
      "Apple's language before Swift. Still present in older iOS and macOS codebases and in long-lived libraries.",
  },
  "Objective-C++": {
    role: "Front end",
    summary:
      "Objective-C that can also compile C++, used to bridge Apple frameworks to cross-platform C++ code.",
  },
  Dart: {
    role: "Front end",
    summary:
      "The language behind Flutter, compiling one codebase to native mobile, desktop and web applications.",
  },

  // --- data
  SQL: {
    role: "Data",
    summary:
      "The language for asking relational databases questions. Declarative: you describe the result you want, not how to fetch it.",
  },
  Prisma: {
    role: "Data",
    summary:
      "A schema language that defines your models once, then generates a typed database client and the migrations to match.",
  },
  GraphQL: {
    role: "Data",
    summary:
      "A query language for APIs where the client states exactly which fields it needs, instead of accepting a fixed response shape.",
  },
  R: {
    role: "Data",
    summary:
      "Built by statisticians for statistics. The default tool for serious modelling, and for charts that end up in papers.",
  },
  Julia: {
    role: "Data",
    summary:
      "Aimed at numerical and scientific computing: readable like Python, fast like C, without dropping into another language for speed.",
  },
  "Jupyter Notebook": {
    role: "Data",
    summary:
      "Code, its output and prose in one document. How analysis is usually explored and shared before it becomes an application.",
  },
  "Protocol Buffer": {
    role: "Data",
    summary:
      "A schema for compact binary messages, with generated code for each language. The wire format under most gRPC services.",
  },

  // --- config and infrastructure
  Dockerfile: {
    role: "Config",
    summary:
      "The recipe for a container image: base system, dependencies and start command, so an application runs the same everywhere.",
  },
  Terraform: {
    role: "Config",
    summary:
      "Declares infrastructure as files — servers, networks, databases — so an environment can be reviewed and recreated exactly.",
  },
  YAML: {
    role: "Config",
    summary:
      "Indentation-based configuration, readable enough to hand-edit. The format of CI pipelines and Kubernetes manifests.",
  },
  JSON: {
    role: "Config",
    summary:
      "The lingua franca for configuration and API payloads. Strict, unambiguous, and supported everywhere.",
  },
  TOML: {
    role: "Config",
    summary:
      "Configuration designed to be obvious to read, with real types. Used by Cargo, Poetry and pyproject.toml.",
  },
  INI: {
    role: "Config",
    summary:
      "The oldest key-and-section configuration format, still the simplest thing that works for flat settings.",
  },
  XML: {
    role: "Config",
    summary:
      "Verbose but precise markup with schemas and namespaces. Common in Java, .NET and document formats.",
  },
  Dotenv: {
    role: "Config",
    summary:
      "Environment variables in a file, keeping secrets and per-machine settings out of the code that reads them.",
  },
  EditorConfig: {
    role: "Config",
    summary:
      "Indentation and whitespace rules that every editor in a team honours, so formatting stops being a matter of opinion.",
  },
  "Ignore List": {
    role: "Config",
    summary:
      "Patterns telling a tool what to leave alone — .gitignore, .dockerignore. Small files with a large effect on what ships.",
  },
  Procfile: {
    role: "Config",
    summary:
      "Declares the processes an application runs — web, worker, scheduler — for platforms that start them for you.",
  },

  // --- tooling
  Shell: {
    role: "Tooling",
    summary:
      "Scripts that drive the tools already on the machine. The glue holding builds, deployments and one-off automation together.",
  },
  PowerShell: {
    role: "Tooling",
    summary:
      "Windows automation that passes structured objects between commands rather than lines of text.",
  },
  Batchfile: {
    role: "Tooling",
    summary:
      "The original Windows command scripts. Still the shortest path to a double-clickable task on Windows.",
  },
  Makefile: {
    role: "Tooling",
    summary:
      "Declares how files are built from other files and rebuilds only what changed. Older than most build tools and still in use.",
  },
  CMake: {
    role: "Tooling",
    summary:
      "Generates real build files for whichever compiler and platform you are on. The usual entry point to a C or C++ build.",
  },

  // --- docs
  Markdown: {
    role: "Docs",
    summary:
      "Plain text that reads fine unrendered and converts to HTML. Every README you have opened.",
  },
  reStructuredText: {
    role: "Docs",
    summary:
      "A stricter documentation markup with cross-references and directives. The format behind Sphinx and most Python docs.",
  },
  TeX: {
    role: "Docs",
    summary:
      "Typesetting for documents where mathematics and layout must be exact. Still the standard for academic publishing.",
  },
  Haskell: {
    role: "Back end",
    summary:
      "Purely functional and lazily evaluated, with a type system strong enough to encode much of a program's meaning.",
  },
};

/** Descriptions are optional: an unrecognised language simply gets no box. */
export function languageFacts(language: string): LanguageFacts | null {
  return LANGUAGE_INFO[language] ?? null;
}
