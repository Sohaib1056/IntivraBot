"""Per-field interview rubrics.

A single generic prompt asks a network engineer to "describe a challenging
project" the same way it asks a React developer — which is why interviews felt
identical for every role. Each field here carries what a real interviewer in
that line of work actually probes, and what would be nonsense to ask.

Field ids mirror the candidate-side skill domains in the frontend.
"""

FIELDS: dict[str, dict] = {
    "software": {
        "label": "Software Development",
        "probe": (
            "how they design and structure code, debugging approach, handling edge cases, "
            "testing, code review habits, and trade-offs they chose in real projects"
        ),
        "style": "Ask for concrete implementation detail — how, not just what.",
        "avoid": "Do not ask trivia they would look up (exact syntax, API signatures).",
        "titles": ["developer", "engineer", "programmer", "full stack", "frontend", "backend", "software", "mobile", "web"],
        "fallbacks": [
            "Walk me through a feature you built end to end — what did you have to decide along the way?",
            "Describe the hardest bug you have debugged. How did you track it down?",
            "How do you decide when to refactor code versus leave it alone?",
            "How do you make sure the code you write actually works before it ships?",
        ],
    },
    "ai-data": {
        "label": "AI & Data",
        "probe": (
            "problem framing, data quality and leakage, feature choices, model selection and "
            "evaluation metrics, overfitting, and how they moved a model into production"
        ),
        "style": "Push on evaluation and why a metric was the right one for the problem.",
        "avoid": "Do not ask them to recite algorithm formulas from memory.",
        "titles": ["data scientist", "machine learning", "ml engineer", "ai engineer", "data analyst", "data engineer"],
        "fallbacks": [
            "Take a model you built — how did you decide it was good enough to use?",
            "Tell me about messy data you had to work with. How did you clean and validate it?",
            "How do you tell whether a model is overfitting, and what do you do about it?",
            "Describe a time your analysis changed someone's decision. How did you present it?",
        ],
    },
    "devops": {
        "label": "DevOps & Cloud",
        "probe": (
            "pipeline design, deployment and rollback strategy, infrastructure as code, "
            "monitoring and alerting, incident handling, and cost/reliability trade-offs"
        ),
        "style": "Anchor questions in real outages, deploys and automation they have run.",
        "avoid": "Do not ask for exact CLI flags or YAML syntax.",
        "titles": ["devops", "sre", "site reliability", "cloud engineer", "platform engineer", "infrastructure"],
        "fallbacks": [
            "Walk me through what happens from a developer's commit to it running in production in your setup.",
            "Tell me about a deployment that went wrong. How did you detect it and roll back?",
            "What do you monitor, and how do you decide what deserves an alert at 3am?",
            "How do you keep environments consistent between staging and production?",
        ],
    },
    "qa": {
        "label": "QA & Testing",
        "probe": (
            "how they derive test cases from requirements, risk-based prioritisation, "
            "manual vs automation judgement, bug reporting quality, and regression strategy"
        ),
        "style": "Give a small scenario and ask what they would test and in what order.",
        "avoid": "Do not ask them to write framework code from memory.",
        "titles": ["qa", "sqa", "quality assurance", "test engineer", "tester", "automation engineer"],
        "fallbacks": [
            "You are handed a login screen with no documentation. What do you test, and in what order?",
            "How do you decide which tests are worth automating and which stay manual?",
            "Describe a serious bug that reached production. How did it get past testing?",
            "What makes a bug report good enough that a developer can act on it immediately?",
        ],
    },
    "it-support": {
        "label": "IT Support & Systems",
        "probe": (
            "structured troubleshooting steps, how they isolate a fault, user communication "
            "under pressure, prioritising tickets, escalation judgement, and documentation"
        ),
        "style": (
            "Use realistic desk scenarios — a user cannot log in, a machine will not boot, "
            "a printer is offline — and ask for their step-by-step diagnosis."
        ),
        "avoid": "Do NOT ask software development or coding questions.",
        "titles": ["support", "helpdesk", "help desk", "service desk", "system administrator", "sysadmin", "it officer", "desktop"],
        "fallbacks": [
            "A user says they cannot log in this morning, and it worked yesterday. What do you check, in order?",
            "A laptop will not boot past the manufacturer logo. Walk me through your diagnosis.",
            # Deliberately the longest question in any bank: the three competing
            # tickets have to be named or there is no prioritisation to ask about.
            "Three tickets land at once: a director's email is down, a printer is jammed, and a new joiner needs a machine. How do you prioritise?",
            "Tell me about an angry user you dealt with. How did you handle the conversation?",
            "When do you stop troubleshooting and escalate — and what do you hand over?",
        ],
    },
    "network-security": {
        "label": "Networking & Security",
        "probe": (
            "how traffic actually flows, subnetting and routing decisions, where they would "
            "capture packets, firewall rule design, and how they contain an incident"
        ),
        "style": "Use topology and incident scenarios; ask what they would check first and why.",
        "avoid": "Do NOT ask software development or coding questions.",
        "titles": ["network", "noc", "security", "soc", "cyber", "penetration", "infosec"],
        "fallbacks": [
            "One branch office has lost connectivity while the rest are fine. How do you narrow down where the fault is?",
            "Users report the network is 'slow'. What do you measure before you change anything?",
            "Walk me through how you would design firewall rules for a new internal service.",
            "You suspect a machine on the network is compromised. What are your first three actions?",
            "Explain how you would segment a network and why it matters for security.",
        ],
    },
    "database": {
        "label": "Databases",
        "probe": (
            "schema design and normalisation choices, indexing, slow-query diagnosis, "
            "transactions and locking, backup/restore, and migration safety"
        ),
        "style": "Ask about a real slow query or a schema decision and the reasoning behind it.",
        "avoid": "Do not ask for exact SQL syntax recall.",
        "titles": ["dba", "database"],
        "fallbacks": [
            "A query that used to run in a second now takes a minute. How do you find out why?",
            "Walk me through how you would design the tables for a simple booking system.",
            "When does adding an index hurt rather than help?",
            "How do you run a schema migration on a live database without downtime?",
        ],
    },
    "design": {
        "label": "Design & UX",
        "probe": (
            "their process from research to handoff, how they justify a design decision, "
            "handling critique, accessibility, and measuring whether a design worked"
        ),
        "style": "Ask them to walk through one real design decision end to end.",
        "avoid": "Do not ask engineering implementation questions.",
        "titles": ["designer", "ux", "ui", "product design", "graphic"],
        "fallbacks": [
            "Take one screen you designed and walk me through why it looks the way it does.",
            "How do you find out what users actually need before you start designing?",
            "Tell me about feedback you disagreed with. How did you handle it?",
            "How do you know a design you shipped was successful?",
        ],
    },
    "management": {
        "label": "Management & Business",
        "probe": (
            "planning and prioritisation, handling scope change and slipping timelines, "
            "stakeholder conflict, how they gather requirements, and how they measure delivery"
        ),
        "style": "Use situational questions about people, deadlines and competing priorities.",
        "avoid": "Do not ask hands-on coding questions.",
        "titles": ["manager", "project manager", "product", "business analyst", "scrum master", "lead", "coordinator"],
        "fallbacks": [
            "A project is going to miss its deadline. When and how do you tell the client?",
            "How do you gather requirements when stakeholders want contradictory things?",
            "Tell me about a conflict in your team. What did you actually do?",
            "How do you decide what gets built first when everything is 'urgent'?",
        ],
    },
    "general": {
        "label": "General",
        "probe": "their practical experience, judgement, and how they handle real situations in this role",
        "style": "Keep questions grounded in the actual duties of the role.",
        "avoid": "Do not assume the role is a software job.",
        "titles": [],
    },
}

# Canonical skills (from the taxonomy) that point at a field. Only the
# distinctive ones — shared skills like Git or Communication say nothing.
FIELD_SKILLS: dict[str, set[str]] = {
    "software": {
        "JavaScript", "TypeScript", "React", "Next.js", "Vue", "Angular", "Svelte", "Redux",
        "Tailwind CSS", "Node.js", "Express", "Django", "Flask", "FastAPI", "Spring", "Laravel",
        "GraphQL", "REST APIs", "Java", "C++", "C#", "PHP", "Ruby", "Go", "Rust", "Kotlin",
        "Swift", "Flutter", "React Native", "Android", "iOS", "OOP", "Design Patterns",
        "Data Structures & Algorithms", "System Design", "HTML", "CSS",
    },
    "ai-data": {
        "Machine Learning", "Deep Learning", "TensorFlow", "PyTorch", "scikit-learn", "Pandas",
        "NumPy", "NLP", "Computer Vision", "LLMs", "Statistics", "Power BI", "Data Visualization",
        "ETL",
    },
    "devops": {
        "Docker", "Kubernetes", "AWS", "Azure", "GCP", "CI/CD", "Terraform", "Ansible", "Jenkins",
        "GitHub Actions", "Monitoring", "Nginx", "Bash", "Linux",
    },
    "qa": {
        "Selenium", "Cypress", "Jest", "Playwright", "Manual Testing", "Automation Testing",
        "API Testing", "Performance Testing", "Test Case Design", "Regression Testing", "Bug Tracking",
    },
    "it-support": {
        "Technical Support", "Helpdesk", "Troubleshooting", "Hardware Repair", "Windows Server",
        "Active Directory", "Office 365", "Virtualization", "Backup & Recovery", "Remote Support",
        "Customer Handling",
    },
    "network-security": {
        "TCP/IP", "Routing & Switching", "Cisco", "Firewalls", "VPN", "DNS", "Wireless Networks",
        "Network Troubleshooting", "Network Security", "Penetration Testing",
        "Vulnerability Assessment", "SIEM", "Incident Response", "Compliance",
    },
    "database": {
        "SQL", "MySQL", "PostgreSQL", "MongoDB", "Oracle", "SQL Server", "Redis", "SQLite",
        "Database Administration", "Query Optimization",
    },
    "design": {
        "Figma", "Adobe XD", "Photoshop", "Illustrator", "Canva", "Prototyping", "Wireframing",
        "Design Systems", "User Research", "Accessibility", "Video Editing",
    },
    "management": {
        "Project Management", "Business Analysis", "Stakeholder Management", "Risk Management",
        "Documentation", "Agile", "Recruitment", "HR Operations", "Sales", "Digital Marketing",
        "SEO", "Content Writing", "Accounting",
    },
}


def detect_field(job_title: str = "", job_skills: list[str] | None = None) -> str:
    """Best-guess field id for a role, from its required skills and title.

    Skills are the stronger signal (an HR writes them deliberately); the title
    breaks ties and covers jobs listed with vague or unusual skills.
    """
    scores: dict[str, float] = {k: 0.0 for k in FIELD_SKILLS}

    for skill in job_skills or []:
        s = skill.strip()
        for field, members in FIELD_SKILLS.items():
            if s in members:
                scores[field] += 1.0

    title = (job_title or "").lower()
    for field, meta in FIELDS.items():
        if field == "general":
            continue
        for keyword in meta["titles"]:
            if keyword in title:
                # Enough to decide when skills are silent, not enough to
                # overturn a clear skill signal.
                scores[field] = scores.get(field, 0.0) + 0.75
                break

    best = max(scores, key=lambda k: scores[k]) if scores else "general"
    return best if scores.get(best, 0) > 0 else "general"


def rubric(field_id: str) -> dict:
    return FIELDS.get(field_id) or FIELDS["general"]
