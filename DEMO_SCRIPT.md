# MARSWEAVE: 2-3 Minute Jury Demonstration Script
### NASA Space Apps Challenge 2026 Presentation Guide

Use this script to deliver an impactful, concise 2–3 minute demonstration to judging panels and reviewers.

---

### Step 1: Opening & The Paradigm Shift (0:00 – 0:30)
* **Visual:** Open MARSWEAVE. The dark, cinematic mission control interface fills the screen with Arcadia Planitia at the center.
* **Speaker:**
  > *"Judges, a future astronaut standing on Mars does not need another static map with layer toggles. They need an intelligent operational system that tells them where to walk, what to avoid, where to stop for science, and why. That is MARSWEAVE."*
  > *"MARSWEAVE combines the real NASA/USGS products it actually loads (MOLA-HRSC elevation, SWIM2 ice map, THEMIS thermal inertia, Viking brightness, LMD dust optical depth, MRO relay passes, MSL RAD and MEDA reference values) into a decision-support prototype. Every layer is labelled REAL, DERIVED, MODELLED or SIMULATED; HiRISE, CRISM and SHARAD are not loaded."*

---

### Step 2: Mission Setup & Multi-Objective Route Planning (0:30 – 1:00)
* **Action:**
  1. On the left panel under **MISSION CONFIGURATION**, select the **WATER & ICE** objective.
  2. Click **PLAN EVA MISSION**.
* **Visual:** Watch the multi-objective A* engine trace three distinct routes on the map: Route Alpha (Cyan), Route Beta (Purple), and Route Gamma (Red).
* **Speaker:**
  > *"When we select our scientific objective and click 'Plan EVA', MARSWEAVE doesn't draw a generic straight line. Notice Route Gamma—it is the shortest path, but it dangerously cuts across a 34° scree crater rim and loses communications. MARSWEAVE selects Route Alpha instead."*
  > *"On the right panel under 'WHY THIS ROUTE?', the system lists its live numbers for the selected route: distance, time, slope exposure, modelled relay coverage and the candidate sites it passes. Read the values off the screen; they change with the start point and profile."*

---

### Step 3: Science Target Inspection & Evidence Chain (1:00 – 1:30)
* **Action:** Click directly on **Candidate SCI-04** on the map (or click its card in the panel).
* **Visual:** The **Target Inspector & Evidence Chain Modal** opens.
* **Speaker:**
  > *"Every site is a candidate picked by a fixed rule from the real layers, not a detection. When we inspect SCI-04, the evidence chain lists the real values behind the pick: the DEM slope and elevation at that cell and the coarse (about 3 km) SWIM2 ice-consistency index. It says where to look, not that ice is there."*
* **Action:** Close the modal.

---

### Step 4: Live Simulation & Dynamic Environmental Adaptation (1:30 – 2:15)
* **Action:** Click the **PLAY** button on the bottom timeline bar. Toggle speed to **5x**.
* **Visual:** The astronaut marker moves along Route Alpha with real-time vitals (battery %, suit $\text{O}_2$, heart rate) updating continuously.
* **Speaker:**
  > *"Now we simulate the EVA. As the astronaut walks, our vitals monitor suit battery, oxygen depletion, and radiation dose rate calibrated from MSL RAD."*
* **Action:** Click **JURY DEMO FLOW** in the top bar, or wait for the automatic dust surge at T+45min.
* **Visual:** The dynamic amber warning banner appears:
  `⚠ DUST STORM SURGE DETECTED (MRO MARCI/MCS): tau = 1.88`.
* **Speaker:**
  > *"Look at the map—we switch on the dust SCENARIO (simulated, not a detection): optical depth is set to the real MY34 peak from the LMD record and the planner adds a penalty. The system offers a re-plan."*
* **Action:** Click **REPLAN EVA ROUTE**.
* **Visual:** The route is recalculated and the panel shows the real deltas computed from the old and new route.

---

### Step 5: Mission Debrief & Conclusion (2:15 – 2:30)
* **Action:** Click **REPORT** in the top right header.
* **Visual:** The **EVA Mission Debrief Report** appears with completed science samples, traversed distance, and NASA PDS archival citations.
* **Speaker:**
  > *"At mission completion, the crew and ground control get a debrief of distance, time, radiation dose and targets. Every layer in it says whether it is real, derived, modelled or simulated."*
  > *"MARSWEAVE proves that the best route on Mars is mission-dependent. Thank you."*
