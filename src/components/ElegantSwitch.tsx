import { motion, AnimatePresence } from "motion/react";

interface ElegantSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  offLabel?: string;
  onLabel?: string;
  direction?: "vertical" | "horizontal";
  offColor?: string;
  onColor?: string;
  noLabels?: boolean;
}

export function ElegantSwitch({
  checked, onChange,
  offLabel, onLabel,
  direction = "vertical",
  offColor = "#10b981",
  onColor = "#f43f5e",
  noLabels = false,
}: ElegantSwitchProps) {
  const isOff = !checked;

  return (
    <div className={`elegant-switch elegant-switch--${direction}`}>
      {/* Morphing label */}
      {direction === "vertical" && !noLabels && (
        <div className="elegant-switch__label-box">
          <AnimatePresence mode="wait">
            {isOff ? (
              <motion.span
                key="off"
                initial={{ y: 20, opacity: 0, filter: "blur(4px)", scale: 0.95 }}
                animate={{ y: 0, opacity: 1, filter: "blur(0px)", scale: 1 }}
                exit={{ y: -20, opacity: 0, filter: "blur(4px)", scale: 0.95 }}
                transition={{ type: "spring", stiffness: 170, damping: 15 }}
                className="elegant-switch__label"
                style={{ color: offColor, textShadow: `0 0 20px ${offColor}77` }}
              >
                {offLabel}
              </motion.span>
            ) : (
              <motion.span
                key="on"
                initial={{ y: 20, opacity: 0, filter: "blur(4px)", scale: 0.95 }}
                animate={{ y: 0, opacity: 1, filter: "blur(0px)", scale: 1 }}
                exit={{ y: -20, opacity: 0, filter: "blur(4px)", scale: 0.95 }}
                transition={{ type: "spring", stiffness: 170, damping: 15 }}
                className="elegant-switch__label"
                style={{ color: onColor, textShadow: `0 0 20px ${onColor}77` }}
              >
                {onLabel}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Horizontal labels */}
      {direction === "horizontal" && !noLabels && (
        <span className="elegant-switch__side-label" style={{ color: isOff ? offColor : undefined }}>
          {offLabel}
        </span>
      )}

      {/* Toggle track */}
      <div
        onClick={() => onChange(!checked)}
        className={`elegant-switch__track ${checked ? "elegant-switch__track--on" : "elegant-switch__track--off"}`}
        style={{
          borderColor: `${isOff ? offColor : onColor}4D`,
          boxShadow: isOff
            ? `0 0 30px ${offColor}33`
            : `0 0 30px ${onColor}33`,
        }}
      >
        <div
          className="elegant-switch__track-bg"
          style={{
            background: isOff
              ? `linear-gradient(to right, ${offColor}, ${offColor}dd)`
              : `linear-gradient(to right, ${onColor}, ${onColor}dd)`,
            opacity: 1,
          }}
        />

        <motion.div
          layout
          transition={{ type: "spring", stiffness: 140, damping: 14, mass: 0.5 }}
          className="elegant-switch__knob"
        >
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.8, 1, 0.8] }}
            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            className="elegant-switch__core"
            style={{
              backgroundColor: isOff ? offColor : onColor,
              boxShadow: isOff
                ? `0 0 10px ${offColor}cc`
                : `0 0 10px ${onColor}cc`,
            }}
          />
        </motion.div>
      </div>

      {/* Horizontal right label */}
      {direction === "horizontal" && !noLabels && (
        <span className="elegant-switch__side-label" style={{ color: checked ? onColor : undefined }}>
          {onLabel}
        </span>
      )}
    </div>
  );
}
