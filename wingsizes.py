import json
import numpy as np
import matplotlib.pyplot as plt

# --- Data ---
data_json = """
[
  {"name":"Honey bee (worker)","species":"Apis mellifera","MTOW_g":0.10,"Wingweight_g":0.0015,"Wingspan_mm":18.0,"Wingbeat_Hz":230.0,"Power_W":0.0575},
  {"name":"Bumblebee (worker)","species":"Bombus impatiens","MTOW_g":0.200,"Wingweight_g":0.00104,"Wingspan_mm":26.0,"Wingbeat_Hz":173.0,"Power_W":0.132},
  {"name":"Monarch butterfly","species":"Danaus plexippus","MTOW_g":0.50,"Wingweight_g":0.035,"Wingspan_mm":100.0,"Wingbeat_Hz":9.0,"Power_W":0.116},
  {"name":"Ruby-throated hummingbird","species":"Archilochus colubris","MTOW_g":3.4,"Wingweight_g":0.170,"Wingspan_mm":90.0,"Wingbeat_Hz":53.0,"Power_W":0.27}
]
"""
data = json.loads(data_json)

# --- Fitting Recipe ---
def power_fit(x, y):
    """Performs a power-law fit y = a * x^b using least-squares in log-log space."""
    lx, ly = np.log10(x), np.log10(y)
    b, loga = np.polyfit(lx, ly, 1)  # slope, intercept
    a = 10**loga
    yhat = a * (x**b)
    # R² calculated on the log-transformed data
    r2 = 1 - ((ly - np.log10(yhat))**2).sum() / ((ly - ly.mean())**2).sum()
    return a, b, r2

# --- Plotting Snippet ---
def plot_loglog_with_fit(x, y, labels, xlabel, ylabel, title):
    """Generates a log-log scatter plot with a power-law fit and annotations."""
    a, b, r2 = power_fit(np.array(x, float), np.array(y, float))
    
    # Create a smooth range for the fit line
    xr = np.linspace(min(x) * 0.8, max(x) * 1.2, 200)
    yr = a * (xr**b)
    
    plt.figure()
    plt.loglog(x, y, 'o', label='Data')
    plt.loglog(xr, yr, '-', label='Power-Law Fit')
    
    # Annotate points
    for xi, yi, lab in zip(x, y, labels):
        plt.annotate(lab, (xi, yi), xytext=(5, 5), textcoords="offset points", fontsize=9)
    
    plt.xlabel(xlabel)
    plt.ylabel(ylabel)
    plt.title(title)
    
    # Display the fit equation and R² value
    plt.text(
        min(x), 
        min(y), 
        f"y = {a:.3g} \u00d7 x^{b:.3f}\nR\u00b2 (log-space) = {r2:.3f}",
        verticalalignment='bottom',
        fontsize=10,
        bbox=dict(boxstyle='round,pad=0.5', fc='wheat', alpha=0.5)
    )
    
    plt.grid(True, which='both', linestyle='--', linewidth=0.5)
    plt.legend()
    plt.tight_layout()

# --- Main Execution ---
if __name__ == "__main__":
    # Extract data into lists for plotting
    names = [d['name'] for d in data]
    mtow = [d['MTOW_g'] for d in data]
    wing_weight = [d['Wingweight_g'] for d in data]
    span = [d['Wingspan_mm'] for d in data]
    freq = [d['Wingbeat_Hz'] for d in data]
    power = [d['Power_W'] for d in data]

    print("--- Running Power-Law Fit Analysis ---")
    
    # A: Wingbeat vs Wingspan
    plot_loglog_with_fit(span, freq, names, "Wingspan (mm)", "Wingbeat (Hz)", "A: Wingbeat vs. Wingspan")
    
    # B: Wingweight vs MTOW
    plot_loglog_with_fit(mtow, wing_weight, names, "Maximum Takeoff Weight (g)", "Wing Weight (g)", "B: Wing Weight vs. MTOW")
    
    # C: Power vs MTOW
    plot_loglog_with_fit(mtow, power, names, "Maximum Takeoff Weight (g)", "Power (W)", "C: Power vs. MTOW")
    
    # D: Power vs Wingspan
    plot_loglog_with_fit(span, power, names, "Wingspan (mm)", "Power (W)", "D: Power vs. Wingspan")

    print("\nDisplaying plots...")
    plt.show()
    print("--- Analysis Complete ---")
