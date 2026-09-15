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
        description: '128-lane fixed-point matrix-vector engine: 1024 MACs per cycle at 450 MHz, ~850 GOPS sustained. Same architecture family Microsoft built BrainWave on. Timing closed through RTL structure alone (register fanout trees, an address tree with fanout 1): no synthesis flags, no XDC hacks, no phys_opt_design.'
    },
    {
        id: 'tanh', folder: 'hardware', slug: 'tanh_pipeline',
        name: 'tanh Accelerator', subtitle: 'SystemVerilog • Fixed-Point Pipeline',
        repo: 'https://github.com/Jordan-Leis/tanh-in-system-verilog',
        tags: ['SystemVerilog', 'DSP48E2', 'Fixed-Point', 'Verification'],
        note: '280 -> 840 MHz over four rewrites',
        description: 'Pipelined Q2.12 tanh core with a ready/valid streaming interface, taken from 280 MHz to 840 MHz over four rewrites. The last jump came from registering every inter-DSP link, which moved the design from routing-bound to logic-bound. Verified against a golden model with randomized stimulus and mid-stream backpressure.'
    },
    {
        id: 'wordle', folder: 'hardware', slug: 'wordle_on_kria',
        name: 'Wordle on Kria', subtitle: 'SystemVerilog • Hardware/Software Co-Design',
        repo: 'https://github.com/Jordan-Leis/wordle-in-system-verilog',
        tags: ['SystemVerilog', 'AXI-GPIO', 'Vitis', 'Baremetal C', 'FSM'],
        note: 'FSM in fabric, baremetal C on the PS',
        description: 'Wordle in FPGA fabric on a Xilinx Kria. A 5-state FSM in programmable logic holds the game; baremetal C on the ARM processing system drives it over seven AXI-GPIO blocks and UART. Block design generated from Tcl, exported to Vitis via XSA.'
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
        description: 'Document platform toxicologists at Health Canada are testing: ingestion, multimodal extraction (Azure Document Intelligence, Docling), prompt-driven workflows, and DeepEval LLM-as-a-judge evaluation in the app. React, FastAPI, PostgreSQL, Better Auth with GitHub OAuth and Microsoft Entra. Models swap between Azure OpenAI, Vertex AI / Gemini, Ollama, and vLLM. Ships as containers for Azure.'
    },
    {
        id: 'awards', folder: 'software', slug: 'uw_awards_search',
        name: 'UW Awards Search', subtitle: 'Python • Playwright • static site',
        repo: 'https://github.com/Jordan-Leis/uw-awards-search',
        site: 'https://jordan-leis.github.io/uw-awards-search/',
        tags: ['Python', 'Playwright', 'SQLite', 'Fuse.js', 'GitHub Actions'],
        note: 'searchable mirror of the UW Awards Directory',
        description: 'Unofficial, searchable mirror of the University of Waterloo Awards Directory. There is no HTTP API, so a Python + Playwright scraper drives the PeopleSoft search UI, splits searches recursively to beat its ~300-row cap, and fetches every award by deep link. Output is a no-framework static site with Fuse.js full-text search and a "match my profile" filter. GitHub Actions refreshes the data three times a year.'
    },
    {
        id: 'coursify', folder: 'software', tree: false, slug: 'coursify',
        name: 'Coursify', subtitle: 'LLM course scheduling • WIP',
        repo: 'https://github.com/Jordan-Leis/Course-Selector',
        site: 'https://coursify-iota.vercel.app',
        tags: ['LLMs', 'NLP', 'Python'],
        description: 'Natural-language course scheduling for Waterloo Engineering students, built on LLMs. Work in progress.'
    },
    {
        id: 'sred', folder: 'software', slug: 'sred_copilot',
        name: 'SR&ED Copilot Lite', subtitle: 'FastAPI • retrieval',
        repo: 'https://github.com/Jordan-Leis/SR-ED-Copilot',
        tags: ['FastAPI', 'SQLite', 'TF-IDF', 'HTMX'],
        note: 'T661 drafts from markdown evidence, with citations',
        description: 'FastAPI service that drafts SR&ED documentation from markdown evidence. Ingests project files and commit history, tags snippets against an SR&ED facet ontology, searches with TF-IDF, finds patents by cosine similarity with a claim skeleton, and writes a T661-style draft with inline citations or a DOCX export.'
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
        description: 'Overcurrent relay settings from a CSV of equipment data: computes pickups, simulates a 10× fault and I²t trip time, stores results in SQLite, plots current vs time with Matplotlib, and prints a PDF job aid with ReportLab.'
    },
    {
        id: 'linxicon', folder: 'software', slug: 'linxicon_solver',
        name: 'Linxicon Optimal Solver', subtitle: 'Python • graph search • daily atlas',
        repo: 'https://github.com/Jordan-Leis/linxicon-optimal-solver',
        site: '/linxicon-solver/',
        tags: ['Python', 'NumPy', 'ConceptNet', 'wordfreq', 'pytest', 'D3'],
        note: 'optimal word chains, daily replay at /linxicon-solver/',
        description: 'Solver for Linxicon, the daily word-chain game. Rules reverse-engineered from the game\'s client bundles, not guessed: ConceptNet Numberbatch cosine similarity (800 of 813 sampled pairs match exactly; a second lexical measure is still being pinned down), a 0.3995 link threshold, top-5 link pruning, and a 50-word board cap. Builds the threshold graph, runs bidirectional BFS for every shortest chain ranked by average link score, and checks each chain against a port of the board simulator before you type it in. Offline after the first run. The atlas at /linxicon-solver/ replays each day\'s search.'
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
        description: 'Reinforcement learning controller for off-grid hybrid microgrids in rural sub-Saharan Africa. Most of the field treats electricity as a commodity to sell back to a grid; this treats it as scarce and asks how many people one generator can reach. A 150-run benchmark on five years of NASA POWER climate data found DDPG optimal: 23% less diesel per year at equal reliability. Led an 11-person team. First author, CUCAI 2026.'
    },
    {
        id: 'rag', folder: 'papers', slug: 'rag_agents',
        name: 'RAG Agent Architectures', subtitle: 'co-author • CUCAI 2025',
        paper: 'https://cucai.ca/2025_proceedings.pdf#page=118',
        repo: 'https://github.com/Madhav-Malhotra/political-chatbot',
        tags: ['RAG', 'LLM Evaluation', 'Multi-Agent'],
        note: 'co-author, CUCAI 2025',
        description: 'Evaluated retrieval-augmented generation architectures for decision-making across domains: 400+ simulated games scoring strategic consistency, then political analysis with human evaluation from 50+ participants. Co-author; presented at CUCAI 2025 and the Ethical Tech for Global Futures Symposium (Best Undergraduate Research Presentation).'
    }
];
