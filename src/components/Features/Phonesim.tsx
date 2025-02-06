import { CSSProperties, useState, useEffect } from "react";
import { GiPerspectiveDiceOne, GiPerspectiveDiceTwo, GiPerspectiveDiceThree } from "react-icons/gi";

const PhoneSimulator = () => {
  const [view, setView] = useState("view_3");
  const [dimensions, setDimensions] = useState({ width: 400, height: 650 });

  // Update phone size dynamically based on window size
  useEffect(() => {
    const handleResize = () => {
      const maxWidth = Math.min(window.innerWidth * 0.8, 400); // Max width at 80% of the window or 400px
      const height = maxWidth * (650 / 400); // Maintain original aspect ratio (400:650)
      setDimensions({ width: maxWidth, height });
    };

    handleResize(); // Call on component mount
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const styles: { [key: string]: CSSProperties } = {
    perspectiveWrapper: {
      perspective: "1000px",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      margin: "20px 0",
      position: "relative", // Ensure valid typing
    },
    phone: {
      border: "7px solid #ddd",
      borderRadius: "40px",
      overflow: "hidden",
      transition: "transform 0.5s ease, box-shadow 0.5s ease",
      width: `${dimensions.width}px`,
      height: `${dimensions.height}px`,
      background: "#1e1e1e",
      position: "relative",
      boxShadow: "0px 8px 20px rgba(0, 0, 0, 0.5)",
    },
    notch: {
      position: "absolute",
      top: "8px",
      left: "50%",
      transform: "translateX(-50%)",
      width: "80px",
      height: "20px",
      backgroundColor: "#000",
      borderRadius: "10px",
      zIndex: 2,
    },
    iframeContainer: {
      flex: "1",
      overflow: "auto",
      height: "100%",
      scrollbarWidth: "none",
      msOverflowStyle: "none",
    },
    iframe: {
      width: "100%",
      height: "100%",
      border: "none",
    },
    buttonContainer: {
      position: "absolute",
      bottom: "10px",
      left: "0",
      width: "100%",
      display: "flex",
      justifyContent: "center",
      gap: "15px",
      zIndex: 10,
    },
    iconButton: {
      background: "#fff",
      border: "none",
      borderRadius: "50%",
      width: "40px",
      height: "40px",
      cursor: "pointer",
      fontSize: "16px",
      transition: "background 0.3s, transform 0.2s",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0px 2px 6px rgba(0, 0, 0, 0.15)",
    },
    activeButton: {
      background: "#333",
      color: "#fff",
      transform: "scale(1.1)",
    },
    view1: {
      transform: "rotateX(50deg) rotateY(0deg) rotateZ(-50deg)",
      boxShadow: "-3px 3px 0 #bbb, -6px 6px 0 #bbb, -9px 9px 0 #bbb, -12px 12px 0 #bbb, -14px 10px 20px #666",
    },
    view2: {
      transform: "rotateX(0deg) rotateY(-60deg) rotateZ(0deg)",
      boxShadow: "5px 1px 0 #bbb, 9px 2px 0 #bbb, 12px 3px 0 #bbb, 15px 4px 0 #bbb, 0 7px 20px #999",
    },
    view3: {
      transform: "rotateX(0deg) rotateY(0deg) rotateZ(0deg)",
      boxShadow: "0px 3px 0 #bbb, 0px 4px 0 #bbb, 0px 5px 0 #bbb, 0px 7px 0 #bbb, 0px 10px 20px #666",
    },
  };

  const currentStyle =
    view === "view_1" ? styles.view1 : view === "view_2" ? styles.view2 : styles.view3;

  return (
    <div style={styles.perspectiveWrapper}>
      {/* Phone */}
      <div style={{ ...styles.phone, ...currentStyle }}>
        {/* Notch */}
        <div style={styles.notch}></div>
        {/* Iframe Container */}
        <div style={styles.iframeContainer}>
          <iframe src="https://cal.unenter.live/unenter" style={styles.iframe} />
        </div>
        {/* Buttons on the Phone Body */}
        <div style={styles.buttonContainer}>
          <button
            onClick={() => setView("view_1")}
            style={{
              ...styles.iconButton,
              ...(view === "view_1" ? styles.activeButton : {}),
            }}
            aria-label="Laying View"
          >
            <GiPerspectiveDiceOne />
          </button>
          <button
            onClick={() => setView("view_2")}
            style={{
              ...styles.iconButton,
              ...(view === "view_2" ? styles.activeButton : {}),
            }}
            aria-label="Side View"
          >
            <GiPerspectiveDiceTwo />
          </button>
          <button
            onClick={() => setView("view_3")}
            style={{
              ...styles.iconButton,
              ...(view === "view_3" ? styles.activeButton : {}),
            }}
            aria-label="Front View"
          >
            <GiPerspectiveDiceThree />
          </button>
        </div>
      </div>
    </div>
  );
};

export default PhoneSimulator;
