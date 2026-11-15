# MARSWEAVE Scientific & Computational Methodology

## 1. Multi-Objective Route Optimization
Standard navigation systems solve for the shortest Euclidean or Manhattan path. In planetary exploration, terrain steepness, geomechanical hazards, scientific harvest, and life-support consumption dictate operational feasibility.

### Mathematical Formulation
Let the exploration terrain be modeled as a directed weighted graph $G = (V, E)$. For an edge $(u, v) \in E$ connecting adjacent grid cells, the operational cost $C(u, v)$ is formulated as:

$$C(u, v) = w_d \cdot d(u, v) + P_{\text{slope}}(v) + P_{\text{hazard}}(v) + P_{\text{comms}}(v) - R_{\text{science}}(v) - R_{\text{ice}}(v)$$

Where:
1. **Distance Metric:** $d(u, v) = \sqrt{\Delta x^2 + \Delta y^2}$, scaled by grid cell dimensions ($136\text{ m}$).
2. **Slope Penalty Function:**
   $$P_{\text{slope}}(v) = \begin{cases} 
   0 & \text{if } \theta(v) \le 14^\circ \\
   w_s \cdot \left(\frac{\theta(v) - 14}{4}\right)^{1.8} & \text{if } 14^\circ < \theta(v) \le \theta_{\text{max}} \\
   \infty & \text{if } \theta(v) > \theta_{\text{max}}
   \end{cases}$$
   where $\theta_{\text{max}} = 25^\circ$ for nominal pressurized suits and $14^\circ$ under mobility contingency.
3. **Hazard Penalty:**
   $$P_{\text{hazard}}(v) = w_h \cdot H(v) \cdot 8.0$$
   where $H(v) \in [0, 1]$ represents normalized boulder density and rim scree risk.
4. **Communication Shadow Penalty:**
   $$P_{\text{comms}}(v) = \begin{cases}
   w_c \cdot \left(\frac{75 - \text{LOS}(v)}{25}\right) \cdot 4.0 & \text{if } \text{LOS}(v) < 75\% \\
   0 & \text{otherwise}
   \end{cases}$$
5. **Carried equipment:** MODELLED. Walking power is the Minetti et al. (2002) gradient-dependent cost scaled by the Mars/Earth gravity ratio 0.87, for an ASSUMED suited crew mass of 80 kg + 80 kg suit plus payload. Pace and slope limits follow from the NASA PLSS 350 W / 530 W design powers (see "EVA physiology and consumables (v33)" below). The old Pandolf-based rule and the 0.1°/kg slope rule were removed in v33.
6. **Radiation dose (MODELLED):** dose = 26.7 µSv/h × EVA hours, using the published MSL RAD surface rate at Gale (Hassler et al. 2014) as a proxy; solar particle events are not modelled.
7. **Science Target & Ice Attraction Bonuses:**
   $$R_{\text{science}}(v) = w_{\text{sci}} \cdot \frac{V_{\text{target}}}{100}, \quad R_{\text{ice}}(v) = w_{\text{ice}} \cdot \max\left(0, \frac{\text{IceProb}(v) - 65}{35}\right)$$

---

## 2. Dynamic Candidate Generation
The route optimizer generates three distinct profiles for comparison:
- **Route Alpha (Balanced Science & Safety):** Optimized using nominal mission weights ($w_s=2.4, w_h=3.0, w_{\text{sci}}=1.8, w_c=1.6$).
- **Route Beta (Maximum Science Yield):** Biased toward intermediate mineralogical and periglacial waypoints ($w_{\text{sci}}=5.04, w_{\text{ice}}=3.75, w_s=1.68$).
- **Route Gamma (Direct Transit):** Minimizes pure distance ($w_d=4.0$), accepting elevated scree slope exposure and communication blindspots for rapid retreat.

---

## 3. Evidence Chain Verification
Every scientific target presents an empirical chain of causality:
$$\text{Orbital Spectrometer / Radar} \longrightarrow \text{Physical Absorption / Dielectric Echo} \longrightarrow \text{Mineral / Ice Composition} \longrightarrow \text{Sampling Protocol}$$

Example for Target SCI-07:
1. **CRISM:** Deep absorption doublets at $1.41\text{ }\mu\text{m}$ and $1.92\text{ }\mu\text{m}$ $\to$ structural $\text{H}_2\text{O}$ in smectite lattice $\to$ neutral/alkaline paleolake alteration.
2. **THEMIS:** Thermal inertia $380\text{ J m}^{-2}\text{ K}^{-1}\text{ s}^{-1/2}$ $\to$ indurated coherent bedrock with negligible mobile dust mantle.
3. **HiRISE:** Sub-meter layered bench geometry with $4^\circ$ dip $\to$ safe pedestrian accessibility for rover core drilling.

---

## 4. Differential Replanning Engine
When environmental conditions degrade (such as atmospheric dust opacity increasing from $\tau = 0.54$ to $\tau = 1.88$), the route optimizer re-runs pathfinding from the astronaut's active coordinate. The system outputs quantitative comparison vectors:
- $\Delta\text{Distance} = d_{\text{new}} - d_{\text{orig}}$
- $\Delta\text{Time} = t_{\text{new}} - t_{\text{orig}}$
- $\Delta\text{Risk} = \frac{R_{\text{new}} - R_{\text{orig}}}{R_{\text{orig}}} \times 100\%$
- $\Delta\text{Comms} = C_{\text{new}} - C_{\text{orig}}$

## Hazard derivation and target snapping (real DEM only)
When `data/arcadia_dem.json` is present, hazard zones are derived by `deriveHazardsFromSlope`: cells steeper than 14° (the slope where the planner starts penalising), including those with a slope step above 12° to a neighbour, are grouped (8-connectivity) and split into tiles; each tile becomes a circular zone. Comms shadows come from the MODELLED relay grid. Boulders are not resolved at DEM resolution, so roughness is only a proxy. Science targets are snapped to terrain features by `snapScienceTargets` (rules per target type); their science content stays ILLUSTRATIVE. Without a real DEM the hand-authored zones of the synthetic terrain are used and labelled SIMULATED.

## Search
A* uses a binary min-heap with lazy deletion (`MinHeap` in `routeOptimizer.ts`); results were checked to match the earlier linear-scan version on 180 route comparisons.

## EVA physiology and consumables (v33, status MODELLED)

All walking, oxygen and battery numbers come from `engine/evaPhysiology.ts`. No team-invented consumption constants remain.

- Walking cost per gradient: Minetti et al. (2002), J Appl Physiol 93:1039-1046 (5th-order polynomial, gradients -0.45..+0.45).
- Mars gravity: cost ratio 0.060/0.069 = 0.87 (reduced-gravity walking study), direction confirmed by Brown et al. (2018, LBPP treadmill, 0.38 g), which found a larger VO2 drop (about 32 %); 0.87 is the conservative choice. Pavei & Minetti (2016) is about hopping and is not used here.
- Sustainable rate: NASA Mars PLSS studies (NTRS 20250006266): 350 W average, 530 W peak, 8 h EVA. Cross-check: 35 % of the 36 ml/min/kg flight-rule VO2max for an 80 kg crewmember = 348 W.
- Oxygen: 20.9 kJ per litre O2 (NTRS 20120003917). The 8 h, 350 W design EVA needs 0.69 kg O2, matching the 0.7 kg of the closed-loop Mars PLSS schematics.
- Pace: 2.7 km/h nominal (Apollo walkback planning average), slowed so power stays at or below 350 W, never below 1 km/h (Apollo typical 1-2 km/h).
- Planner slope limit: steepest gradient walkable at 1 km/h within 350 W (low risk), 530 W (high risk) or their mean (medium, an interpolation).
- Battery: constant drain over the 8 h design life. The PLSS power column of the source is unit-ambiguous (W-hr), so only the 8 h life is used.
- Reserve warning: 30 min of the 8 h design life.
- Assumptions, shown as such in the app: crew 80 kg + suit/PLSS 80 kg; heart-rate rest 60 / max 180 bpm (%HRR = %VO2R); science stops charged at 350 W; downhill pace capped at nominal; suit stiffness not included.
- Not modelled: thermal load (Apollo 17 logged 120-130 bpm, above our estimate), CO2 scrubber limits, task-time overhead (Apollo 16: about 70 % longer than in 1 g).
