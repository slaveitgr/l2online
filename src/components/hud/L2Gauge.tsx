import type { CSSProperties } from "react";

export type L2GaugeKind = "HP" | "MP" | "CP" | "EXP";

const SPRITES: Record<L2GaugeKind, { bg: string; fill: string }> = {
  HP: {
    bg: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAAQCAYAAAD506FJAAABbElEQVR4nO3avYrbQBTF8f/VjGSvvc6GEFKp2W5BzRZ+u9R5ug3pDIFAKkNIl02wLI3mI8U6xT6AIxDn9wSnmTtnhmsA3a5pgT3wAGWNiCyUDcBX4PPhTzhat2va9XbzcXN3123evG3NeTd3RBG5jpJi6n//OvbPz4fh1H/ywH51e9vdvPvQVs0qGtU0d0gRuY5Ctpu6aVPODKd+74EHq9ftNKUY47mUUubOKCJXYmallBLNN/fAowfW47l3lV+93Pw6/yLLZQCU8TxkAA8QhkDlTtR1gxqAyHKZGdMUCOMIXAaAM0hhJIWRogogslh2qQAOSFwGQOMqnPMAqACILJe9nH9SSQT+NQBnVntnQNEngMiCmVFyMYoBJA98s5R/+BXvK+eTmSaAyFKVguUUXRziT+C7B57GYfjiXdVtt7t7rMpzhxSR68g5pjCej2EMB+DJ4NUq8KOeACJL9noVeO40IiIiIiIiIvJ//AXjlIqh4qCJUQAAAABJRU5ErkJggg==",
    fill: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAAQCAYAAAD506FJAAABUUlEQVR4nO3aPU7DMADF8X8cJ6EfaiUkOAtiZ2HqDcrYnSMws/cYnVhgRtwEobao36RpYzOkPUJrqXm/IYOnp9h6diKDiNRWBPD8cH9nTDxotju92Cbd0KFE5DTK/W6+WS1GzpXD1/fPLwvg9m5wfXPbz66aGGNCZxSRE3HOddM47U8n3wBVAbDf93abFWW+CRouOB86gMjpee9xedEHnizA38+424ksZeBgInIe+eQXAAuwW8zJY0PWagUNJXIOPgqdIJzIw3a9pljOgEMBNHyJWc7YHQblsulLp1LXHjBAw1XnfQvQsTFda0NmEpEziny1DViALDY0k7i2jXiknbEe6rzO/eGRu7KAQwEkSfqWxvYxMwYT1fn11JCmu1ac9+RliSmiDzj+A0iTl60x4zTL+ugegMjFcs7Ni+121G41hzANHUdERERERERERERO7R8KCWVxcYXHfwAAAABJRU5ErkJggg==",
  },
  MP: {
    bg: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAAQCAYAAAD506FJAAABfElEQVR4nO3avWrcQBTF8f+dmZWUxCEhGFJYjTvDNi72HfxQqfNQeQaHdIZAwNWGkC4BW6uV5iOFnMIPIAtW59eqOYLh6oi5BuAvblpgB1wBDSJyqnrgO/A1/fyyN39x076p+fTutW3fn4U2BOeXTigi84gxpz8Pcf+3K3ePRz4HYPe2LtuPH5q23vjonI1LhxSReeRcrK58m/OBx6PtAnBV+9TGYYhptLJ0QBGZkVFKKbH26RLCdQCaru998ypMX/6iGSBysswASnfoM5wRAIaYeehGqk0ANADWxZYOIC+qMIyR45gBpgGQcRyGzGEY1ABETtnUACjmgKcB4P0GH6rpwUK5RGR+//tezmRGUgDAbcyH2jAra24Aeb2vvipuxX89T0fciDiYGsCPMfGrgnMXXDLWexOgBQg5eaVYjsmPqfwGuw/A7THat9L126oJl+bIS2cUkXnkWNI4pP0Q7Q64NXi2Cny9ZDgRmd2zVeClw4iIiIiIiIjIy/gHpt2Ku5FrysAAAAAASUVORK5CYII=",
    fill: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAAQCAYAAAD506FJAAABVklEQVR4nO3Z3UkDQRTF8f/Mbr42kYCkF61BENJBfEwJvvtiCSlDEHyyAK1EQgwY8r27M+NDothAMuCcXwVnuXcPl10QkWQZgKvb++sss+OLi2LYaOT92KFE5DSqql4sl5sn5/zk/fnxLQdwgfFgcDnqFG2stbEzisiJeO/7ebszmn7MAA4FUHmGy41jvdsebwKRfyzxHQ8+sK/CCLjLAaZf+77pAvioweRcEn8DfoXYAaL5XJUA5ACLlYd5SbdoRg0VTUhtEf48r0m4DJKbO2AM603JYumAYwFUpsN8mzHfuqjZROQcMoIpgGMBmGaBbfWiRhKR8/FVXcKxAGzWxTb7h3Mw0bNISHP2SQqQ/fkGEKheQu5uTKsNJsHfgCnvfcrdl+LcvSeUO4KtX+GnAJr1g9tOZ8b2RmR53IAicjp1tQi79RMNN4kdRURERERERERERM7gG7GubxmWVhTiAAAAAElFTkSuQmCC",
  },
  CP: {
    bg: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAAQCAYAAAD506FJAAABZklEQVR4nO3asWvbQBTH8e/znSzLdVtoC1m0ZAkBLxn833XuX5eSLVBa6GQoWeNEsqw7vQ42hXZXBeL3Ge+W33Lv3R3PAG6uyhrYAbcOK0RklgyOwDfg6/enbm83V2VdrarPmzeb7frtu3oRYpg6pIiMY8gpN4fn/cvry2N7bL9EYFdV1Xb94WMdlmUC66cOKSLjCLiti6Iehkx7bHcRuF0Use7zKaVj7+5TRxSRsZjh7p4sxmvgLgKrrmtCKItz51cBEJkvA8C7UzMARICcGvreiEWp8y8yYwakviOlBrgUgBgcTw39ZVFE5q0ITsulAJTRiMvFZUt3AJH5Or8B0uCA/ykAVpRm5w+CKcOJyJgMw8H6ZAA5Aj/SyX9Va/8UliGf90VklhzL/RDa5E/AzwjcPzf+4OTt5r1fYzZMnVFExuGD59fDsD80/gjcG/w1Cnyn9i8yX/+OAk+dR0RERERERET+j98wvYqXSuVuewAAAABJRU5ErkJggg==",
    fill: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAAQCAYAAAD506FJAAABSElEQVR4nO3ZP1LCQBiH4TcLEQJqJhZyFD2DFZ4glpTewQtYcguprDyA3sNxhgEd+TOBJGxiETyBJjsDv6dJZpu8Tb7NbEBEjpYHcH97dW1aZtQ7Pxu2fT90HSUi9djl+SJZriaFLcaPT2+v7f3yKBoM4k4QYFrGbaGI1KawRdgJ/PjzYwpQDQDPy4fWLtkmayjcBsofeAf2HPl/BZSUwCYG7toAaTINTe62S0Sa4QHZZg5A9QVgv7Cp5aR76rJLRBqQbddgF8B+AJz7OUExh2TuNExE6hcAoV/dtwGiHkR9h0Ui0iiTVddqAPThMgLPg7J0mSVN83Sgd1TKcv+Op2SwHwDljmcDN/0LMIfyF1An4sehqQ3rQDZGW8I2AQwv8HsImPMwe2dmu8Qt32mfiNQoT1msvpm0uoxdt4iIiIiIiIiIiEgDfgA8glqREjOCqwAAAABJRU5ErkJggg==",
  },
  EXP: {
    bg: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAAQCAYAAAD506FJAAABZklEQVR4nO3asWrcQBSF4f9qRtlN4pWJ2FKNwYVhGxf7dqnzdA7pDAGnXHATHNhNLM1Ko5vCceH0a4F8vnaa08zhznANoF5fNsAWuHL3JSIyS2bWAd+Brw8/f+ysXl821er95/rTalNVZ01ZFmHqkCJyGn0/5v3+9+7h1+F2f2i/RGB7fv5xU9dVU5ZxMLN+6pAichoxusVYNXkc2R/abQSuFu+Kpu+PwzD07u5TZxSREzEzd/dhuSgugOsILLuuC2VZ9gC6/yLzZQaAt203AkSAlI6E0FKWEVADiMyX0fcDKR2BfwXg7qSUSClNGk1EXsfzUz8ChBAJIb44EJH5sec3gAOkpwIwKyyEaGj+F3kLLOfR4GkCuBuy3y+KYl0URUYlIDJnNo5jGLLfA3cRuHls87cYfbM6+3ABjBMHFJETcR9z2/7ZPbb5FrgxeLEKfK0/AJH5+n8VeOo8IiIiIiIiIvI6/gIqB4ynCdeWmgAAAABJRU5ErkJggg==",
    fill: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAAQCAYAAAD506FJAAABPElEQVR4nO3ZvW0CMRyG8efuzH1IkGsisUpmSMUGpEGizQwZIC0SS1BlhoxClOoQcF/YTgFFqnScFXh/A1hP479lG0TkbYHcH97dW1aZtQ7Pxu2fT90HSUi9djl+SJZriaFLcaPT2+v7f3yKBoM4k4QYFrGbaGI1KawRdgJ/PjzYwpQDQDPy4fWLtkmayjcBsofeAf2HPl/BZSUwCYG7toAaTINTe62S0Sa4QHZZg5A9QVgv7Cp5aR76rJLRBqQbddgF8B+AJz7OUExh2TuNExE6hcAoV/dtwGiHkR9h0Ui0iiTVddqAPThMgLPg7J0mSVN83Sgd1TKcv+Op2SwHwDljmcDN/0LMIfyF1An4sehqQ3rQDZGW8I2AQwv8HsImPMwe2dmu8Qt32mfiNQoT1msvpm0uoxdt4iIiIiIiIiIiEgDfgA8glqREjOCqwAAAABJRU5ErkJggg==",
  },
};

const FALLBACK: Record<L2GaugeKind, { from: string; to: string; text: string }> = {
  HP: { from: "#c94a37", to: "#7f1712", text: "#fff" },
  MP: { from: "#3776d5", to: "#123777", text: "#fff" },
  CP: { from: "#d2ab28", to: "#73500a", text: "#161008" },
  EXP: { from: "#c18d25", to: "#6d4a09", text: "#fff" },
};

interface L2GaugeProps {
  kind: L2GaugeKind;
  value: number;
  max?: number;
  width?: number;
  height?: number;
  label?: string;
  num?: string;
  className?: string;
  style?: CSSProperties;
}

export function L2Gauge({
  kind,
  value,
  max = 1,
  width = 190,
  height = 16,
  label,
  num,
  className,
  style,
}: L2GaugeProps) {
  const pct = Math.max(0, Math.min(1, max ? value / max : 0));
  const base = `/hud/gauges/${kind}`;
  const sprite = SPRITES[kind];
  const fallback = FALLBACK[kind];

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width,
        height,
        overflow: "hidden",
        backgroundColor: "#070705",
        backgroundImage: `url(${base}_bg.png), url(${sprite.bg})`,
        backgroundSize: "100% 100%, 100% 100%",
        backgroundRepeat: "no-repeat",
        borderRadius: 1,
        imageRendering: "auto",
        ...style,
      }}
    >
      <div style={{ position: "absolute", inset: 0, width: `${pct * 100}%`, overflow: "hidden" }}>
        <div
          style={{
            width,
            height,
            backgroundColor: fallback.to,
            backgroundImage: `url(${base}_fill.png), url(${sprite.fill}), linear-gradient(180deg, ${fallback.from}, ${fallback.to})`,
            backgroundSize: `${width}px 100%, ${width}px 100%, 100% 100%`,
            backgroundRepeat: "no-repeat",
          }}
        />
      </div>
      {label && (
        <span
          style={{
            position: "absolute",
            left: 4,
            top: 0,
            lineHeight: `${height}px`,
            fontSize: 10,
            fontWeight: 700,
            color: fallback.text,
            textShadow: fallback.text === "#fff" ? "0 1px 1px #000" : "none",
          }}
        >
          {label}
        </span>
      )}
      {num && (
        <span
          style={{
            position: "absolute",
            right: 4,
            top: 0,
            lineHeight: `${height}px`,
            fontSize: 10,
            color: "#fff",
            textShadow: "0 1px 1px #000",
          }}
        >
          {num}
        </span>
      )}
    </div>
  );
}
