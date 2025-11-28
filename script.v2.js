document.addEventListener('DOMContentLoaded', () => {
    // --- Data ---
    const batteries = [
        // model, weight_g, max_power_mW, capacity_mAh, voltage_V
        { model: 'CR1025', weight: 0.7, max_power_mW: 50, capacity_mAh: 30, voltage_V: 3.0 },
        { model: 'CR1225', weight: 1.2, max_power_mW: 70, capacity_mAh: 50, voltage_V: 3.0 },
        { model: 'CR1616', weight: 1.2, max_power_mW: 80, capacity_mAh: 55, voltage_V: 3.0 },
        { model: 'CR2032', weight: 3.1, max_power_mW: 220, capacity_mAh: 225, voltage_V: 3.0 },
        { model: 'Z-TAG 12', weight: 0.012, max_power_mW: 0.1, capacity_mAh: 0.1, voltage_V: 3.0 },
        { model: 'Cymbet EnerChip', weight: 0.5, max_power_mW: 40, capacity_mAh: 5, voltage_V: 3.7 },
        { model: 'CR2450', weight: 6.2, max_power_mW: 600, capacity_mAh: 620, voltage_V: 3.0 },
        { model: 'Panasonic ML614', weight: 0.23, max_power_mW: 15, capacity_mAh: 3.4, voltage_V: 3.0 },
        { model: 'SparkFun Lipo 40mAh', weight: 1.0, max_power_mW: 800, capacity_mAh: 40, voltage_V: 3.7 },
        { model: 'GNB27 30mAh', weight: 0.8, max_power_mW: 600, capacity_mAh: 30, voltage_V: 3.7 },
        { model: 'Full-River 22mAh', weight: 0.6, max_power_mW: 440, capacity_mAh: 22, voltage_V: 3.7 },
        { model: 'Molight 12mAh', weight: 0.4, max_power_mW: 240, capacity_mAh: 12, voltage_V: 3.7 },
        { model: '5mAh Lipo', weight: 0.2, max_power_mW: 100, capacity_mAh: 5, voltage_V: 3.7 },
    ];

    const actuators = [
    { model: 'Mide PPA-1001',          weight_g: 2.8,  max_power_mW_est: 83,   max_power_freq_Hz: 250 },
    { model: 'PI P-876.A15',           weight_g: 12.8, max_power_mW_est: 229,  max_power_freq_Hz: 250 },
    { model: 'TDK PHUA8060',           weight_g: 11.0, max_power_mW_est: 207,  max_power_freq_Hz: 250 },
    { model: 'APC International 40-1040', weight_g: 3.6, max_power_mW_est: 98, max_power_freq_Hz: 250 },
    { model: 'Thorlabs PK4DMP1',       weight_g: 0.52, max_power_mW_est: 27,   max_power_freq_Hz: 250 },
    { model: 'Noliac NAC2021',         weight_g: 0.74, max_power_mW_est: 34,   max_power_freq_Hz: 250 },

    // High-performance candidates (updated)
    { model: 'Steminc Mini Stack',     weight_g: 0.10, max_power_mW_est: 9,    max_power_freq_Hz: 250 },
    { model: 'Thorlabs PK3JUP1 Stack', weight_g: 4.0,  max_power_mW_est: 105,  max_power_freq_Hz: 250 },
    { model: 'Steminc 40mm Bimorph',   weight_g: 2.5,  max_power_mW_est: 77,   max_power_freq_Hz: 250 },
    ];


    // --- Core Physics & Calculation ---

    const wingConstants = {
        airDensity_kg_m3: 1.225,
        liftCoefficient: 1.2,
        aspectRatio: 4,
        wingMassCoefficient: 0.001, // g/cm^3
        wingMassExponent: 3,
    };

    const otherComponentsWeight = {
        // electronics_g is now calculated dynamically
        airframe_g: 0.3,    // Airframe and wing mechanism
    };

    let performanceChart = null; // To hold the chart instance
    let totalElectronicsWeight_g = 0; // To be populated from the DOM

    function calculateElectronicsWeight() {
        const table = document.querySelector('#electronics-section table');
        if (!table) return 0.5; // Fallback if table not found

        const rows = table.querySelectorAll('tbody tr');
        let total_mg = 0;

        rows.forEach(row => {
            const cell = row.cells[1]; // Get the 'Weight (mg)' cell
            if (cell) {
                // Extracts numbers from strings like "~94 mg" or "94 mg"
                const match = cell.textContent.match(/[\d.]+/);
                if (match) {
                    total_mg += parseFloat(match[0]);
                }
            }
        });
        
        // Use the footer's total if it exists, as it's the official sum
        const footer = table.querySelector('tfoot tr td');
        if (footer) {
            const match = footer.textContent.match(/(\d+\.?\d*)\s*mg/);
             if (match) {
                total_mg = parseFloat(match[1]);
             }
        }

        return total_mg / 1000; // Convert to grams
    }

    function findLightestBattery(actuator, batteries) {
        const suitableBatteries = batteries.filter(b => b.max_power_mW >= actuator.max_power_mW_est);
        if (suitableBatteries.length === 0) return null;
        return suitableBatteries.sort((a, b) => a.weight - b.weight)[0];
    }

    function getRequiredPower(wingspan_m, freq_Hz, theta_rad) {
        const k = 0.5; // Aerodynamic constant
        const wingArea_m2 = Math.pow(wingspan_m, 2) / wingConstants.aspectRatio;
        // Power scales with (amplitude * frequency)^2, and amplitude is related to theta
        const tip_velocity_m_s = wingspan_m * freq_Hz * theta_rad;
        const requiredPower_W = k * wingConstants.airDensity_kg_m3 * wingArea_m2 * Math.pow(tip_velocity_m_s, 2);
        return requiredPower_W * 1000; // Return in mW
    }

    function calculatePowerLimitedLift(actuator, battery, wingspan_m, wingArea_m2, theta_rad, totalWeight_g) {
        // --- ANALYSIS BASED ON MAX SAFE FREQUENCY ---
        const cAir = 340; // m/s
        const maLimit = 0.3;
        const max_safe_freq_for_wing = (maLimit * cAir) / (2 * Math.PI * theta_rad * wingspan_m);
        const effective_freq_Hz = Math.min(actuator.max_power_freq_Hz, max_safe_freq_for_wing);

        // 1. Calculate the THEORETICAL lift and power at the effective max frequency.
        const amplitude_m = wingspan_m * Math.tan(theta_rad);
        const avg_wing_speed_m_s = amplitude_m * effective_freq_Hz;
        const lift_N = 0.5 * wingConstants.airDensity_kg_m3 * wingArea_m2 * Math.pow(avg_wing_speed_m_s, 2) * wingConstants.liftCoefficient;
        const theoretical_lift_g = (lift_N / 9.81) * 1000;
        const powerRequiredForTheoreticalLift_mW = getRequiredPower(wingspan_m, effective_freq_Hz, theta_rad);

        // 2. Determine the actual available power from the hardware.
        const power_sources = {
            'Battery': battery.max_power_mW,
            'Actuator': actuator.max_power_mW_est,
        };
        
        let constraint_name = 'Theoretical Lift';
        let availablePower_mW = Infinity;
        for (const [name, power] of Object.entries(power_sources)) {
            if (power < availablePower_mW) {
                availablePower_mW = power;
                constraint_name = name;
            }
        }
        
        // 3. Scale the lift if available power is less than what's required for max theoretical lift.
        let final_lift_g = theoretical_lift_g;
        if (powerRequiredForTheoreticalLift_mW > availablePower_mW && powerRequiredForTheoreticalLift_mW > 0) {
            const powerRatio = availablePower_mW / powerRequiredForTheoreticalLift_mW;
            // Lift is proportional to v^2, and power is proportional to v^3 (roughly). A common simplification is Lift ~ Power^(2/3).
            final_lift_g = theoretical_lift_g * Math.pow(powerRatio, 2 / 3);
        }

        // 4. Calculate the power demanded to hover (lift = total weight)
        let hoverPowerDemand_mW = 0;
        if (theoretical_lift_g > 0) {
            const liftRatio = totalWeight_g / theoretical_lift_g;
            // Power scales with Lift^(3/2)
            hoverPowerDemand_mW = powerRequiredForTheoreticalLift_mW * Math.pow(liftRatio, 3/2);
        }

        return {
            lift_g: final_lift_g,
            constraint: {
                name: constraint_name,
                value: availablePower_mW,
                demand: hoverPowerDemand_mW, // The demand is the power required to lift the total weight
                powers: { ...power_sources, 'Theoretical Lift Power': powerRequiredForTheoreticalLift_mW },
            }
        };
    }
    
    function calculatePerformance(actuator, battery, wingspan_m, theta_rad) {
        // 1. Calculate the total weight budget first
        const componentWeight_g = actuator.weight_g
                                + (battery ? battery.weight : 0)
                                + totalElectronicsWeight_g
                                + otherComponentsWeight.airframe_g;
        const wingspan_cm = wingspan_m * 100;
        const wing_weight_g = wingConstants.wingMassCoefficient * Math.pow(wingspan_cm, wingConstants.wingMassExponent);
        const totalWeight_g = componentWeight_g + (2 * wing_weight_g);

        // 2. Calculate lift based on the full weight budget
        const wingArea_m2 = Math.pow(wingspan_m, 2) / wingConstants.aspectRatio;
        const { lift_g, constraint } = calculatePowerLimitedLift(actuator, battery, wingspan_m, wingArea_m2, theta_rad, totalWeight_g);
        
        // 3. The ratio is now simply the generated lift vs the total weight
        const liftToWeightRatio = totalWeight_g > 0 ? lift_g / totalWeight_g : 0;

        return { liftToWeightRatio, lift_g, totalWeight_g, constraint };
    }

    function generatePerformanceCurve(actuator, battery, theta_rad, max_wingspan_cm) {
        let performanceData = [];
        for (let span_cm = 1; span_cm <= max_wingspan_cm; span_cm += 0.5) {
            const wingspan_m = span_cm / 100;
            const performance = calculatePerformance(actuator, battery, wingspan_m, theta_rad);
            performanceData.push({
                x: span_cm,
                y: performance.liftToWeightRatio,
                lift: performance.lift_g,
                weight: performance.totalWeight_g,
                actuator: actuator.model,
                battery: battery.model,
                constraint: performance.constraint
             });
        }
        return performanceData;
    }

    function createOrUpdatePerformancePlot(theta_rad, max_wingspan_cm) {
        const plotsContainer = document.getElementById('performance-plots');
        if (!plotsContainer) return;

        let bestPerformance = null;

        const datasets = actuators.map((actuator, index) => {
            const battery = findLightestBattery(actuator, batteries);
            if (!battery) return null;

            const performanceData = generatePerformanceCurve(actuator, battery, theta_rad, max_wingspan_cm);

            performanceData.forEach(point => {
                if (!bestPerformance || point.y > bestPerformance.liftToWeightRatio) {
                    const wingspan_cm = point.x;
                    const wing_weight_g = wingConstants.wingMassCoefficient * Math.pow(wingspan_cm, wingConstants.wingMassExponent);
                    bestPerformance = {
                        liftToWeightRatio: point.y,
                        wingspan_cm: wingspan_cm,
                        lift_g: point.lift,
                        totalWeight_g: point.weight,
                        actuator_model: point.actuator,
                        actuator_weight: actuator.weight_g,
                        battery: battery, // Pass the whole battery object
                        battery_model: point.battery,
                        battery_weight: battery.weight,
                        wing_weight: 2 * wing_weight_g,
                        electronics_weight: totalElectronicsWeight_g,
                        airframe_weight: otherComponentsWeight.airframe_g,
                        theta_deg: theta_rad * (180 / Math.PI),
                        constraint: point.constraint
                    };
                }
            });

            return {
                label: `${actuator.model} (w/ ${battery.model})`,
                data: performanceData,
                borderColor: `hsl(${(index * 360 / actuators.length)}, 90%, 50%)`,
                fill: false,
                tension: 0.1
            };
        }).filter(Boolean);

        if (performanceChart) {
            performanceChart.data.datasets = datasets;
            performanceChart.update('none');
        } else {
            plotsContainer.innerHTML = '';
            const canvas = document.createElement('canvas');
            plotsContainer.appendChild(canvas);
            performanceChart = new Chart(canvas.getContext('2d'), {
                type: 'line',
                data: { datasets },
                options: {
                    responsive: true,
                    plugins: {
                        title: { display: true, text: 'Actuator Performance: Lift-to-Weight Ratio vs. Wingspan' },
                        tooltip: {
                            callbacks: {
                                title: (context) => `Wingspan: ${context[0].raw.x.toFixed(1)} cm`,
                                label: (context) => `${context.dataset.label}: ${context.raw.y.toFixed(2)} L/W Ratio`
                            }
                        }
                    },
                    scales: {
                        x: { type: 'logarithmic', title: { display: true, text: 'Wingspan (cm)' } },
                        y: { title: { display: true, text: 'Lift-to-Weight Ratio' }, beginAtZero: true }
                    }
                }
            });
        }
        updateDiscussion(bestPerformance);
        updateWeightSummary(bestPerformance);
    }

    function updateDiscussion(performance) {
        const contentDiv = document.getElementById('discussion-content');
        if (!contentDiv) return;

        if (!performance) {
            contentDiv.innerHTML = '<p>No viable configurations found.</p>';
            return;
        }

        const { liftToWeightRatio, wingspan_cm, lift_g, totalWeight_g, actuator_model, battery, theta_deg, constraint } = performance;

        // --- Flight Time Calculation ---
        const boostEfficiency = 0.85; // Assumed efficiency of the voltage booster
        
        // Flight time based on running at the maximum available power (the bottleneck).
        const actualPowerDraw_mW = constraint.value;
        const powerConsumption_mW = actualPowerDraw_mW / boostEfficiency;
        const batteryEnergy_mWh = battery.capacity_mAh * battery.voltage_V;
        const dischargeCurrent_mA = powerConsumption_mW / battery.voltage_V;
        const cRate = dischargeCurrent_mA / battery.capacity_mAh;

        let flightTime_display = 'N/A';
        if (powerConsumption_mW > 0) {
            const flightTime_hours = batteryEnergy_mWh / powerConsumption_mW;
            const flightTime_minutes = flightTime_hours * 60;
            flightTime_display = flightTime_minutes >= 1 ? `${flightTime_minutes.toFixed(1)} minutes` : `${(flightTime_minutes * 60).toFixed(0)} seconds`;
        }

        contentDiv.innerHTML = `
            <h3>Peak Performance Analysis</h3>
            <p>
                The highest calculated lift-to-weight ratio is <strong>${liftToWeightRatio.toFixed(2)}</strong>. 
                A ratio of 1.0 or higher is required for flight.
            </p>
            <ul>
                <li><strong>Configuration:</strong> ${actuator_model} with ${battery.model}</li>
                <li><strong>Wingspan:</strong> ${wingspan_cm.toFixed(1)} cm</li>
                <li><strong>Stroke Angle:</strong> ${theta_deg.toFixed(1)}°</li>
                <li><strong>Calculated Lift:</strong> ${lift_g.toFixed(2)} g</li>
                <li><strong>Total Weight:</strong> ${totalWeight_g.toFixed(2)} g</li>
                <li><strong>Estimated Flight Time (at hover):</strong> ${flightTime_display}</li>
            </ul>

            <h3>Powertrain Analysis at Peak</h3>
            <ul>
                <li><strong>Power Bottleneck:</strong> ${constraint.name}</li>
                <li><strong>Actual Power Draw:</strong> ${actualPowerDraw_mW.toFixed(1)} mW</li>
                <li><strong>Theoretical Hover Power:</strong> ${constraint.demand.toFixed(1)} mW (power needed for L/W = 1.0)</li>
                <br>
                <li><strong>Battery Energy:</strong> ${batteryEnergy_mWh.toFixed(1)} mWh</li>
                <li><strong>Discharge Rate:</strong> ${cRate.toFixed(1)}C</li>
            </ul>

            <h3>Underlying Assumptions</h3>
            <p>This analysis is based on the following constants and simplified models:</p>
            <ul>
                <li><strong>Air Density:</strong> ${wingConstants.airDensity_kg_m3} kg/m³</li>
                <li><strong>Wing Lift Coefficient:</strong> ${wingConstants.liftCoefficient} (Constant, assumed)</li>
                <li><strong>Wing Aspect Ratio:</strong> ${wingConstants.aspectRatio}</li>
                <li><strong>Wing Mass Model:</strong> Assumes mass scales with wingspan cubed (${wingConstants.wingMassCoefficient} g/cm³).</li>
                <li><strong>Power Constraint:</strong> Lift is limited by the lesser of the wing's max safe speed (Mach 0.3 tip speed) or the actuator's max frequency, and scaled by the selected battery's max power output.</li>
            </ul>
        `;
    }

    function updateWeightSummary(performance) {
        const contentDiv = document.getElementById('weight-summary-content');
        if (!contentDiv) return;

        if (!performance) {
            contentDiv.innerHTML = '<p>No data available.</p>';
            return;
        }

        const { totalWeight_g, actuator_weight, battery_weight, wing_weight, electronics_weight, airframe_weight } = performance;

        const actuator_percent = (actuator_weight / totalWeight_g) * 100;
        const battery_percent = (battery_weight / totalWeight_g) * 100;
        const wing_percent = (wing_weight / totalWeight_g) * 100;
        const electronics_percent = (electronics_weight / totalWeight_g) * 100;
        const airframe_percent = (airframe_weight / totalWeight_g) * 100;

        contentDiv.innerHTML = `
            <p>This section breaks down the total weight of the optimal configuration identified in the plot.</p>
            <ul>
                <li><strong>Total Weight:</strong> ${totalWeight_g.toFixed(2)} g</li>
                <li>Actuator: ${actuator_weight.toFixed(2)} g (${actuator_percent.toFixed(1)}%)</li>
                <li>Battery: ${battery_weight.toFixed(2)} g (${battery_percent.toFixed(1)}%)</li>
                <li>Wings (x2): ${wing_weight.toFixed(2)} g (${wing_percent.toFixed(1)}%)</li>
                <li>Electronics: ${electronics_weight.toFixed(2)} g (${electronics_percent.toFixed(1)}%)</li>
                <li>Airframe/Mechanism: ${airframe_weight.toFixed(2)} g (${airframe_percent.toFixed(1)}%)</li>
            </ul>
        `;
    }

    function setupControls() {
        totalElectronicsWeight_g = calculateElectronicsWeight(); // Calculate on startup

        const angleSlider = document.getElementById('stroke-angle-slider');
        const angleValue = document.getElementById('stroke-angle-value');
        const wingspanSlider = document.getElementById('max-wingspan-slider');
        const wingspanValue = document.getElementById('max-wingspan-value');

        function updateVisualization() {
            const angle_deg = parseFloat(angleSlider.value);
            const theta_rad = angle_deg * (Math.PI / 180);
            angleValue.textContent = angle_deg.toFixed(0) + '°';

            const max_wingspan_cm = parseFloat(wingspanSlider.value);
            wingspanValue.textContent = max_wingspan_cm.toFixed(0) + ' cm';

            createOrUpdatePerformancePlot(theta_rad, max_wingspan_cm);
        }

        angleSlider.addEventListener('input', updateVisualization);
        wingspanSlider.addEventListener('input', updateVisualization);
        updateVisualization(); // Initial render
    }

    setupControls();
});
