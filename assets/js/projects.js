// Everything the Files app shows under Projects/. Order within a folder
// is display order. `note` is the one-line annotation in the terminal's
// `tree ~/work` output; `slug` is its directory name there.
const PROJECT_FOLDERS = [
    { id: 'hardware', comment: 'where I am now' },
    { id: 'software', comment: 'things I built because I wanted them to exist' },
    { id: 'papers',   comment: 'where I came from' }
];

const PROJECTS = [
    // hardware/
    {
        id: 'mvm', folder: 'hardware', slug: 'mvm_accelerator',
        name: 'MVM Accelerator', subtitle: 'SystemVerilog • Zynq UltraScale+ MPSoC',
        repo: 'https://github.com/Jordan-Leis/mvm-in-system-verilog',
        tags: ['SystemVerilog', 'Vivado', 'DSP48E2', 'Timing Closure'],
        note: '128 lanes, 450 MHz, ~850 GOPS',
        description: '128-lane fixed-point matrix-vector engine running 1024 MACs per cycle at 450 MHz, sustaining ~850 GOPS. Same architecture family Microsoft built BrainWave on. Timing closed entirely through RTL structure — register fanout trees, an address tree with fanout 1 — with no synthesis flags, XDC hacks, or phys_opt_design.'
    },
    {
        id: 'tanh', folder: 'hardware', slug: 'tanh_pipeline',
        name: 'tanh Accelerator', subtitle: 'SystemVerilog • Fixed-Point Pipeline',
        repo: 'https://github.com/Jordan-Leis/tanh-in-system-verilog',
        tags: ['SystemVerilog', 'DSP48E2', 'Fixed-Point', 'Verification'],
        note: '280 -> 840 MHz over four rewrites',
        description: 'Pipelined Q2.12 tanh core with a ready/valid streaming interface, driven from 280 MHz to 840 MHz across four rewrites. The last gain came from registering every inter-DSP link, moving the design from routing-bound to logic-bound. Verified against a golden model with randomized stimulus and mid-stream backpressure testing.'
    },
    {
        id: 'wordle', folder: 'hardware', slug: 'wordle_on_kria',
        name: 'Wordle on Kria', subtitle: 'SystemVerilog • Hardware/Software Co-Design',
        repo: 'https://github.com/Jordan-Leis/wordle-in-system-verilog',
        tags: ['SystemVerilog', 'AXI-GPIO', 'Vitis', 'Baremetal C', 'FSM'],
        note: 'FSM in fabric, baremetal C on the PS',
        description: 'Wordle running in FPGA fabric on a Xilinx Kria board. Game logic is a 5-state FSM in programmable logic; a baremetal C application on the ARM processing system drives it over seven AXI-GPIO blocks and UART. Vivado block design generated from Tcl, exported to Vitis via XSA handoff.'
    },
    {
        id: 'morse', folder: 'hardware', slug: 'morse_code_riscv',
        name: 'Morse Code in RISC-V Assembly', subtitle: 'RISC-V assembly • SiFive HiFive1',
        repo: 'https://github.com/Jordan-Leis/morse-code-in-riscv-assembly',
        tags: ['RISC-V', 'Assembly', 'HiFive1', 'Bare-metal'],
        note: 'ASCII to Morse on LEDs, bare-metal RISC-V asm',
        description: 'ASCII-to-Morse LED blinker in bare-metal RISC-V assembly on the SiFive HiFive1.'
    },
    {
        id: 'reflex', folder: 'hardware', slug: 'reflex_meter_riscv',
        name: 'Reflex Meter in RISC-V Assembly', subtitle: 'RISC-V assembly • SiFive HiFive1',
        repo: 'https://github.com/Jordan-Leis/reflex-meter-in-riscv-assembly',
        tags: ['RISC-V', 'Assembly', 'HiFive1', 'Bare-metal'],
        note: '0.1 ms reaction timer, polled, on a HiFive1',
        description: 'Polling-based reaction-time meter (0.1 ms resolution) and 8-bit LED counter in bare-metal RISC-V assembly on the SiFive HiFive1.'
    },
    {
        id: 'countdown', folder: 'hardware', slug: 'interrupt_countdown_riscv', tree: false,
        name: 'Interrupt Countdown in RISC-V Assembly', subtitle: 'RISC-V assembly • FE310',
        repo: 'https://github.com/Jordan-Leis/interrupt-countdown-in-riscv-assembly',
        tags: ['RISC-V', 'Assembly', 'FE310', 'Interrupts'],
        description: 'Interrupt-driven LED countdown timer using the FE310 PLIC and GPIO falling-edge IRQs in bare-metal RISC-V assembly.'
    },

    // software/  (Summarization Tool first)
    {
        id: 'summarization', folder: 'software', slug: 'summarization_tool',
        name: 'AI Document Summarization Tool', subtitle: 'React • FastAPI • PostgreSQL',
        repo: 'https://github.com/ScienceGPTstream2/SummarizationTool',
        note: 'doc ingestion to LLM eval, in testing at Health Canada',
        tags: ['React', 'FastAPI', 'PostgreSQL', 'Better Auth', 'DeepEval', 'Azure'],
        description: 'Full-stack platform for document ingestion, multimodal extraction, prompt-driven workflows, and in-app evaluation. React frontend, FastAPI backend, Better Auth sidecar (GitHub OAuth, Microsoft Entra), PostgreSQL. Parsers include Azure Document Intelligence and Docling; the model layer is pluggable across Azure OpenAI, Vertex AI / Gemini, Ollama, and vLLM endpoints. Template workspaces with versioning and sharing, user groups, batch and interactive extraction, DeepEval-powered evaluation with LLM-as-a-judge, and containerized deployment paths for Azure. Currently being tested by toxicologists at Health Canada.'
    },
    {
        id: 'awards', folder: 'software', slug: 'uw_awards_search',
        name: 'UW Awards Search', subtitle: 'Python • Playwright • static site',
        repo: 'https://github.com/Jordan-Leis/uw-awards-search',
        site: 'https://jordan-leis.github.io/uw-awards-search/',
        tags: ['Python', 'Playwright', 'SQLite', 'Fuse.js', 'GitHub Actions'],
        note: 'searchable mirror of the UW Awards Directory',
        description: 'Unofficial, searchable mirror of the University of Waterloo Awards Directory. A Python + Playwright scraper drives the official PeopleSoft search UI (there is no HTTP API), works around its ~300-row-per-search cap by recursively splitting searches, fetches every award by its deep link, and exports validated data to a no-framework static site with Fuse.js full-text search and a "match my profile" filter. A scheduled GitHub Actions workflow refreshes the data three times a year and deploys to GitHub Pages.'
    },
    {
        id: 'coursify', folder: 'software', tree: false, slug: 'coursify',
        name: 'Coursify', subtitle: 'LLM course scheduling • WIP',
        repo: 'https://github.com/Jordan-Leis/Course-Selector',
        site: 'https://coursify-iota.vercel.app',
        tags: ['LLMs', 'NLP', 'Python'],
        description: 'Natural language course scheduling for Waterloo Engineering students, built on LLMs.'
    },
    {
        id: 'sred', folder: 'software', slug: 'sred_copilot',
        name: 'SR&ED Copilot Lite', subtitle: 'FastAPI • retrieval',
        repo: 'https://github.com/Jordan-Leis/SR-ED-Copilot',
        tags: ['FastAPI', 'SQLite', 'TF-IDF', 'HTMX'],
        note: 'T661 drafts from markdown evidence, with citations',
        description: 'Self-contained FastAPI service that prepares SR&ED documentation from markdown evidence: ingests project files and commit history, tags snippets against an SR&ED facet ontology, TF-IDF search, patent lookup by cosine similarity with a claim skeleton, and generates a T661-style draft with inline citations or a DOCX export.'
    },
    {
        id: 'lasercal', folder: 'software', tree: false, slug: 'lasercal',
        name: 'LaserCal', subtitle: 'Qt/C++ motion control',
        repo: 'https://github.com/Jordan-Leis/LaserCal-Embedded-Motion-Control-and-Sensor-Integration',
        tags: ['Qt', 'C++', 'QML', 'SQLite'],
        description: 'Two-axis motion control and sensor processing in Qt/C++, with moving-average filtering and calibration stored in SQLite.'
    },
    {
        id: 'relaycalc', folder: 'software', tree: false, slug: 'relaycalc',
        name: 'RelayCalc', subtitle: 'Python • power systems',
        repo: 'https://github.com/Jordan-Leis/RelayCalc',
        tags: ['Python', 'Matplotlib', 'ReportLab', 'SQLite'],
        description: 'Small Python utility for overcurrent relay settings: reads equipment data from CSV, computes pickups, simulates a 10× fault and I²t trip time, stores results in SQLite, plots current-vs-time with Matplotlib, and generates a PDF job-aid report with ReportLab.'
    },
    {
        id: 'linxicon', folder: 'software', slug: 'linxicon_solver',
        name: 'Linxicon Optimal Solver', subtitle: 'Python • graph search • daily atlas',
        repo: 'https://github.com/Jordan-Leis/linxicon-optimal-solver',
        site: '/linxicon-solver/',
        tags: ['Python', 'NumPy', 'ConceptNet', 'wordfreq', 'pytest', 'D3'],
        note: 'optimal word chains, daily replay at /linxicon-solver/',
        description: 'Solver for Linxicon, the daily word-chain game. The rules were reverse-engineered from the game\'s client bundles rather than guessed: ConceptNet Numberbatch cosine similarity (800/813 sampled pairs match exactly, with a second lexical measure still being pinned down), a 0.3995 link threshold, top-5 link pruning, and a 50-word board cap. Builds the threshold graph, runs bidirectional BFS for all shortest chains ranked by average link score, and verifies each chain against a faithful port of the board simulator before you type it in. Fully offline after the first run. The atlas at /linxicon-solver/ replays each day\'s search: breadth-first search, vector neighborhoods, and server-verified routes through meaning.'
    },

    {
        id: 'termalite', folder: 'software', slug: 'termalite_solo', tree: false,
        name: 'TermaLite Solo', subtitle: 'FastAPI • vector search',
        repo: 'https://github.com/Jordan-Leis/TermaLite-Solo',
        tags: ['Python', 'FastAPI', 'FAISS', 'Sentence Transformers'],
        description: 'Minimal FastAPI service demonstrating vector search and summarisation over a small in-repository dataset: company blurbs embedded with a Sentence Transformer model and searched with FAISS nearest neighbours.'
    },
    {
        id: 'memory-shim', folder: 'software', slug: 'conversation_memory_shim', tree: false,
        name: 'Conversation Memory Shim', subtitle: 'Python • prototype',
        repo: 'https://github.com/Jordan-Leis/Conversation-Memory-Shim',
        tags: ['Python', 'LLM', 'Simulation'],
        description: 'Tiny prototype showing how a short conversation memory reduces repeated constraint mentions: an in-memory store of user constraints and a simulation comparing a baseline conversation with one that remembers the constraint immediately.'
    },
    {
        id: 'cansbridge', folder: 'software', slug: 'cansbridge_outreach', tree: false,
        name: 'Cansbridge Alumni Outreach Tool', subtitle: 'Python • Gemini',
        repo: 'https://github.com/Jordan-Leis/Cansbridge_Scraper',
        tags: ['Python', 'Gemini', 'Web app'],
        description: 'Web app to find and contact Cansbridge alumni in a target career field: heuristic keyword filtering, Gemini classification, FAANG and startup detection, and generated personalized outreach emails.'
    },

    // papers/
    {
        id: 'microgrid', folder: 'papers', slug: 'microgrid_rl',
        name: 'Microgrid RL Controller', subtitle: 'first author • CUCAI 2026',
        paper: 'https://cucai.ca/papers/48',
        repo: 'https://github.com/Jordan-Leis/Microgrid-RL',
        tags: ['Reinforcement Learning', 'TensorFlow', 'Gymnasium', 'NASA POWER'],
        note: 'first-author, CUCAI 2026, -23% diesel',
        description: 'Reinforcement learning controller for off-grid hybrid microgrids in rural sub-Saharan Africa. Most work in the field treats electricity as a commodity to sell back to a grid; this treated it as a scarce resource, optimizing how many people one generator can reach. A 150-run benchmark on five years of NASA POWER climate data found DDPG optimal: 23% less diesel per year at equal reliability. Led an 11-person team. First-authored, accepted at CUCAI 2026.'
    },
    {
        id: 'rag', folder: 'papers', slug: 'rag_agents',
        name: 'RAG Agent Architectures', subtitle: 'co-author • CUCAI 2025',
        paper: 'https://cucai.ca/2025_proceedings.pdf#page=118',
        repo: 'https://github.com/Madhav-Malhotra/political-chatbot',
        tags: ['RAG', 'LLM Evaluation', 'Multi-Agent'],
        note: 'co-author, CUCAI 2025',
        description: 'Evaluated retrieval-augmented generation architectures for generalized decision-making across domains. 400+ simulated games measuring strategic consistency, extended to political analysis with human evaluation from 50+ participants. Co-authored; presented at CUCAI 2025 and the Ethical Tech for Global Futures Symposium, where it received Best Undergraduate Research Presentation.'
    }
];
