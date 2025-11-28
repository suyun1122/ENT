# Product Requirements Document (PRD): Surgical Video Insight App

Status: In Progress

## 🎯 Objective

Enable surgeons, researchers, and educators to **analyze surgical videos automatically** — segmenting phases, detecting tools, generating operative reports, and providing explainable insights — powered by Twelve Labs’ multimodal video understanding APIs (`Analyze`, `Search`).

---

## 😢 Problem Statement

- Manual video review for surgical training and QA is time-intensive and subjective.
- Identifying critical events (e.g., bleeding, tool misplacement) requires frame-by-frame review.
- Operative notes and phase annotations lack consistency across procedures.
- Existing systems are limited to fixed templates or require model retraining for each surgery type.

---

## 🗣️ Use Cases

1. **Automatic Phase & Step Segmentation**
    
    Detect and label surgical phases (e.g., *Preparation → Incision → Tumor Removal → Closure*). Generate chapters with timestamps and summaries.
    
2. **Critical Event Detection / Highlights**
    
    Identify key surgical events: bleeding, tissue dissection, tool collision, CSF leak. Produce AI-generated highlight reels with rationale (“excessive suction near optic nerve detected”).
    
3. **Tool Usage Analysis**
    
    Detect instruments used (grasper, suction, curette) per time interval. Quantify duration and frequency for skill benchmarking.
    
4. **AI-Generated Operative Report**
    
    Summarize full procedure “as if written by the surgeon.”  Include tools, steps, complications, and outcomes.
    
5. **Search & Retrieval**
    
    Query natural language: “moment when dura opened” or “use of Rhoton dissector.” Jump directly to relevant scene with context analytics.
    

---

## 🎨 User Interaction & Design

### Core Screens

- **Procedure Dashboard:** Select → auto-analyze → preview chapters, tool heatmaps, and reports.
- **Video Player View:**
    - Chapters, event markers, and tool markers
    - Hover to see event description and tool-in-use snapshot.
- **Tool Analytics Tab:** Frequency and duration graphs for each instrument.
- **Report Tab:** Editable AI-generated operative note (exportable to PDF/EMR)
    - SOAP (Subjective, Objective, Assessment, and Plan) format
    - **“I executed this surgery" toggle/button:** When enabled, the operative note is rewritten in **first-person perspective** (e.g., “I performed…”, “I observed…”). When disabled, the report remains in **third-person** default mode.

### Interactions

- “Analyze Video” → triggers `Analyze API` pipeline (chapters, summary, highlights).
- “Find by Query” → uses `Search API` to locate time-coded events.
- “Generate Report” → uses structured prompt (see below).

---

## ⚙️ Key Prompts (via Analyze API)

| Feature | Prompt Example |
| --- | --- |
| **Summary** | “Write a concise operative report for this endoscopic surgical video as if you performed it.”

“Write the operative note **in first-person as the operating surgeon**.” |
| **Highlights** | “Identify and describe all critical surgical events such as bleeding, tissue dissection, or tumor removal.” |
| **Chapters** | “Divide the surgery into distinct phases (preparation, approach, lesion removal, closure) and label with timestamps.” |
| **Tool List** | “List all surgical instruments visible in this endonasal procedure with their duration of use.” |

---

## 🤔 Requirements

| Requirement | Importance | Description |
| --- | --- | --- |
| Integration with Twelve Labs `Analyze API` | HIGH | Generate summaries, highlights, chapters, and reports from surgical videos. |
| Integration with `Search API` | HIGH | Retrieve time-coded scenes using natural language queries. |
| Tool Detection Layer | HIGH | Use custom classification or Analyze object detection to tag instruments. |
| Phase Timeline UI | HIGH | Interactive timeline showing phase segmentation and event markers. |
| Report Export (PDF/EMR) | MEDIUM | Enable export of AI-generated operative notes for documentation. |

---

## 📊 Future Expansion

- Multi-procedure comparison dashboards
- Skill scoring and trainee evaluation > pick one procedure with narrow, concrete metrics
- Fine-tuning prompts by surgery type (pituitary, cholecystectomy, etc.).
- Cross-case similarity clustering (via `Embed`).
- ~~Integration with EHR (Electronic Health Record) for automatic documentation.~~

---

> Summary:
> 
> 
> A prompt-driven, multimodal video insight platform that transforms raw surgical footage into structured, explainable, and searchable knowledge — with no custom training required.
>