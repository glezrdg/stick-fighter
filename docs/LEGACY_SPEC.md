# LEGACY_SPEC — especificación visual del juego original

Documento de referencia extraído de `legacy/index.html` (4262 líneas). Cada sección cita líneas exactas. Los hex y valores son literales, no parafraseados. Es la "fuente de verdad estética" para portar el look-and-feel a la nueva versión modular.

> **Cómo usar este doc**: cuando se vaya a portar un componente visual del legacy a la nueva arquitectura, leer la sección correspondiente y replicar valores literalmente. Si el legacy cambia, actualizar este doc en el mismo PR.

---

## 1. Paleta de colores

### 1.1 CSS Variables (líneas 12-20)

```css
:root {
  --red: #ff2a2a; /* rojo principal de la marca: HP, énfasis, glow */
  --red-dark: #8b0000; /* rojo oscuro: gradient HP, sombras */
  --red-deep: #4a0000; /* rojo casi negro: shadows de botones primary */
  --gold: #ffd54a; /* dorado: títulos, valores, oro, énfasis */
  --gold-dark: #b8860b; /* declarado, apenas usado */
  --bg-1: #1a1f24; /* fondo modal 1 (gris azulado oscuro) */
  --bg-2: #0e1317; /* fondo modal 2 (más oscuro, gradiente final) */
}
```

### 1.2 Hex hardcoded relevantes

| Color     | Uso                                                                               | Líneas               |
| --------- | --------------------------------------------------------------------------------- | -------------------- |
| `#000`    | body bg, text-shadow base, modal-box border                                       | 24, multiple         |
| `#1a1f24` | `#game` background, ventiladores fondo                                            | 41, 2140             |
| `#fff`    | text base, chispas, ojo del stickman, filo brillante                              | 2514, 3461           |
| `#ff5050` | HP bar fill top, attack-btn radial top, enemy HP bar fill                         | 63, 186, 2862        |
| `#c41a1a` | HP bar middle, headband, plumas flecha                                            | 63, 2806, 3789       |
| `#8b0000` | HP bar bottom, attack-btn radial bottom (var --red-dark)                          | 63                   |
| `#ff3030` | btn primary gradient top, AURA SANGRE                                             | 372, 932             |
| `#ffd54a` | knob joystick, attack-btn border, AURA DORADA, samurai emblema, crown, var --gold | multiple             |
| `#a06820` | bow-btn border, spear color, arrow shaft (madera)                                 | 204, 1078, 3779      |
| `#cfd8dc` | katana / dual blade, arrow tip, spear tip                                         | 918, 3782            |
| `#1ae0ff` | plasma blade, AURA HIELO, robot eye                                               | 924, 933, 2865       |
| `#9c27b0` | void scythe blade, AURA OSCURA, mage color, mage gem                              | 926, 934, 1083, 2912 |
| `#1a0a2a` | shadow skin base, scythe stroke, wings dark                                       | 913, 3559, 3063      |
| `#fff5cc` | ceiling light shadowColor (luz cálida)                                            | 2172                 |
| `#7a0000` | gore en cuello                                                                    | 2269                 |
| `#8a0000` | charco principal sangre                                                           | 2208                 |
| `#3a0000` | centro charco sangre                                                              | 2209                 |

Enemigos:
| Tipo | Color | Línea |
|---|---|---|
| grunt | `#7be0c4` | 1075 |
| brute | `#5aa890` | 1076 |
| ninja | `#1f3a4a` | 1077 |
| spear | `#a06820` | 1078 |
| dual | `#9c4a4a` | 1079 |
| berserk | `#d40000` | 1080 |
| mage | `#5a30b0` | 1081 |
| heavy | `#383840` | 1082 |
| boss | `#9c27b0` | 1083 |

### 1.3 Gradients clave

- **HP fill** (línea 63): `linear-gradient(180deg, #ff5050 0%, #c41a1a 60%, #8b0000 100%)`
- **HP bar shadow** (línea 59): `box-shadow: 0 0 10px rgba(255, 42, 42, 0.4), 0 2px 6px rgba(0,0,0,0.6)`
- **Modal-box bg** (302-304): `linear-gradient(180deg, rgba(255,42,42,0.08) 0%, transparent 30%), linear-gradient(180deg, var(--bg-1) 0%, var(--bg-2) 100%)`
- **Main-menu modal-box bg** (407-409): triple gradient — `radial-gradient(ellipse at 50% 25%, rgba(255, 42, 42, 0.20) 0%, transparent 65%), radial-gradient(ellipse at 50% 80%, rgba(255, 213, 74, 0.08) 0%, transparent 60%), linear-gradient(180deg, var(--bg-1) 0%, var(--bg-2) 100%)`
- **Wave banner text gradient** (259): `linear-gradient(180deg, var(--gold) 0%, #fff 50%, var(--red) 100%)` con `-webkit-background-clip: text`
- **Toast bg** (581): `linear-gradient(180deg, rgba(40,10,10,0.95), rgba(0,0,0,0.95))`
- **btn primary** (372): `linear-gradient(180deg, #ff3030, #8b0000)` con `box-shadow: 0 4px 0 #4a0000, 0 0 18px rgba(255,42,42,0.45)`
- **btn default** (358): `linear-gradient(180deg, #3a3a3a, #1a1a1a)` con `box-shadow: 0 4px 0 #000`

---

## 2. Tipografías

### 2.1 Fuentes cargadas (línea 9)

```html
<link
  href="https://fonts.googleapis.com/css2?family=Russo+One&family=Black+Ops+One&family=Inter:wght@600;800;900&display=swap"
  rel="stylesheet"
/>
```

- **Russo One** — display industrial. Todo el HUD numérico y labels.
- **Black Ops One** — títulos grandes (banner oleada, defeat, modal-title).
- **Inter** (weights 600, 800, 900) — body, párrafos descriptivos.
- Fallbacks: `'Segoe UI', Arial, sans-serif`, `'Impact', sans-serif`.

### 2.2 Uso por elemento

| Elemento        | Familia       | Tamaño                                 | Color                     | Letter-spacing         |
| --------------- | ------------- | -------------------------------------- | ------------------------- | ---------------------- |
| body            | Inter         | default                                | `#fff` sobre `#000`       | —                      |
| `.hp-text`      | Russo One     | 12px                                   | white                     | 1px                    |
| `.top-info`     | Russo One     | clamp(11px, 3.5vw, 15px)               | `#fff`                    | 1px                    |
| `.wave-info`    | Russo One     | (top-info)                             | var(--red)                | 1px                    |
| `.gold-info`    | Russo One     | (top-info)                             | var(--gold)               | 1px                    |
| `.combo-num`    | Black Ops One | clamp(40px, 13vw, 68px)                | var(--red)                | -1px                   |
| `.combo-label`  | Russo One     | clamp(11px, 3vw, 16px)                 | var(--gold)               | 4px                    |
| `.wave-banner`  | Black Ops One | clamp(28px, 9vw, 44px)                 | gradient (gold→white→red) | clamp(3px, 1.5vw, 6px) |
| `.dmg-pop`      | Russo One     | 20px                                   | `#fff`                    | 1px                    |
| `.dmg-pop.crit` | Russo One     | 28px                                   | var(--red)                | 1px                    |
| `.modal-title`  | Black Ops One | clamp(24px, 7vw, 36px)                 | var(--gold)               | clamp(2px, 1vw, 5px)   |
| `.modal-sub`    | Inter italic  | 13px                                   | `#d0a0a0`                 | 2px                    |
| `.stat-cell .v` | Russo One     | 24px                                   | var(--gold)               | 1px                    |
| `.stat-cell .l` | Inter w800    | 11px uppercase                         | `#c0a0a0`                 | 2px                    |
| `.btn`          | Russo One     | 15px uppercase                         | `#fff`                    | 3px                    |
| `.defeat-text`  | Black Ops One | clamp(30px, 8.5vw, 76px)               | var(--red)                | clamp(2px, 0.8vw, 6px) |
| `.lvlup-name`   | Russo One     | 16px                                   | var(--gold)               | 2px                    |
| `.lvlup-desc`   | Inter w600    | 12px                                   | `#f0d0d0`                 | —                      |
| `.tut-hint`     | Russo One     | clamp(11px, 3vw, 14px) line-height 1.5 | `#fff` (b: gold)          | 1px                    |
| `.toast`        | Russo One     | 14px                                   | var(--gold)               | 2px                    |

Text-shadow base recurrente:

- chips/labels: `1px 1px 0 #000`
- HUD principal: `2px 2px 0 #000, 0 0 6px #000`
- títulos grandes: `3px 3px 0 #000`

---

## 3. Layout del HUD

### 3.1 Stack vertical (de arriba hacia abajo, líneas 50-160)

1. **HP bar** (`.hp-bar` 51-60): `top: 14px+safe-top`, `left/right: 14px+safe-area`, height 18px, ancho fluido. Border 2px var(--red), border-radius 6px.
2. **Top info row** (`.top-info` 74-84): `top: 38px+safe-top`, full width, `justify-content: space-between`, gap 6px. Tres spans: `wave-info` (izq, var--red), `enemyInfo` (centro, white), `gold-info` (der, var--gold).
3. **Stats panel** (`.stats-panel` 88-112): `top: 60px+safe-top`, chips de 9-11px con borde dorado, alineadas en flex-wrap.
4. **Combo box** (`.combo` 114-143): `top: clamp(70px, 16%, 22%)`, `right: 12px+safe-right`, text-align right. Combo-num gigante (~68px, rojo) + combo-label "HITS" (dorado, 4px letter-spacing).
5. **Controls hint** (`.controls-hint` 145-160): `bottom: 12px+safe-bottom`, centrado. `WASD mover · ESPACIO espada · F arco · Q/E habilidades`. Oculto en touch.

### 3.2 Botones de acción touch

- **Joystick** (162-179): aparece donde el usuario toca en mitad izquierda. 110×110, border 3px rgba(255,213,74,0.4), bg rgba(0,0,0,0.3). Knob 50×50 dorado.
- **Attack button** (180-195): `bottom: 24px+safe-bottom, right: 18px+safe-right`. Diámetro clamp(64-80px). Radial gradient `#ff5050 → #800`, border 3px var(--gold), font-size clamp(28-36px). Emoji `⚔`. `box-shadow: 0 6px 0 #500`.
- **Bow button** (197-212): a la izquierda del attack. Diámetro clamp(54-64px). Radial `#5a3a14 → #2a1a04`, border 3px `#a06820`, color `#fff`, emoji `🏹`.
- **Skill buttons** (214-251): `.skill-btn.s1` y `.skill-btn.s2`. 56×56. Radial `#555 → #222`, border 3px `#888`. Cuando `.ready`: border var(--gold), `box-shadow: 0 0 16px rgba(255, 213, 74, 0.8)`. Cooldown: conic-gradient `rgba(0,0,0,0.7)` superpuesto.

### 3.3 Responsive

- `#game` máx 540px de ancho centrado (línea 39).
- `100dvh` con fallback 100vh.
- `--safe-top/bottom/left/right`: env(safe-area-inset-\*).
- Media queries: `(max-width: 360px)` (629-633) y `(max-height: 480px) and (orientation: landscape)` (635-643).

---

## 4. Background del juego

### 4.1 Body / contenedor

- `body` (24): `background: #000` (negro puro detrás de todo).
- `#game` (41): `background: #1a1f24` (gris azulado oscuro — el área "fuera del canvas" en pantallas anchas).

### 4.2 Canvas / arena (función `drawArena()` líneas 2072-2133)

**El piso del legacy es claro/industrial, no oscuro.** Esto es el cambio visual más grande respecto a la nueva versión actual.

```javascript
// piso (2076-2078)
const g = ctx.createLinearGradient(0, fy, 0, fy + fh)
g.addColorStop(0, '#c8ccd0')
g.addColorStop(1, '#9aa0a6')
```

Orden de pintado dentro de drawArena:

1. **Piso gradient** `#c8ccd0 → #9aa0a6` (linear vertical)
2. **Grid metálica** (2080-2087): líneas `rgba(60, 70, 80, 0.35)`, lineWidth 1, tile size `60 * CAM_ZOOM`.
3. **Remaches** (2089-2094): `rgba(40, 50, 60, 0.4)`, círculos r=2 en cada intersección de grid.
4. **Paredes superior/inferior** (2098-2102): gradient `#e8eaed → #b8bcc0`, grosor `30 * CAM_ZOOM`.
5. **Paredes laterales** (2103-2105): color sólido `#a8acb0`.
6. **Tubería superior** (2107-2115): banda `#6a7078` + sublínea `#4a5058` + remaches `#2a3038`.
7. **Ventiladores** (2117-2118 → función 2136-2162): dos `drawWallFan` en `fx + 200*CAM_ZOOM` y `fx + 700*CAM_ZOOM`. Marco `#3a4048`, hueco `#1a1f24`, aspas `#5a6068` rotando con `performance.now() * 0.008`, hub `#7a8088`.
8. **Lámparas parpadeantes** (2120-2121 → función 2165-2186): `drawCeilingLight` en `fx+400` y `fx+900`, fase distinta. shadowColor `#fff5cc`, fillStyle `rgba(255, 245, 180, flicker)`. Cono de luz hacia abajo con gradient amarillo.
9. **Polvo flotante** (2123 → 2189-2202): 25 partículas `rgba(180, 180, 200, 0.25)` que se desplazan lentamente.
10. **Sombra de pared sobre piso** (2125-2128): gradient vertical `rgba(0,0,0,0.35) → rgba(0,0,0,0)` en los primeros `30*CAM_ZOOM` debajo de la pared.
11. **Viñeta final** (2130-2132): `radial-gradient` desde el centro de pantalla, `rgba(0,0,0,0)` en el centro a `rgba(0,0,0,0.35)` en las esquinas.

`ARENA_W = 1200, ARENA_H = 800, CAM_ZOOM = 1.6` (líneas 985-986).

---

## 5. Componentes UI

### 5.1 Main menu (líneas 405-431, 672-689)

```css
.main-menu .modal-box {
  background:
    radial-gradient(ellipse at 50% 25%, rgba(255, 42, 42, 0.2) 0%, transparent 65%),
    radial-gradient(ellipse at 50% 80%, rgba(255, 213, 74, 0.08) 0%, transparent 60%),
    linear-gradient(180deg, var(--bg-1) 0%, var(--bg-2) 100%);
  border: 3px solid var(--red);
  box-shadow:
    0 0 50px rgba(255, 42, 42, 0.5),
    0 12px 40px rgba(0, 0, 0, 0.85);
}
```

Título `STICK FIGHTER` con gradient text gold→red, drop-shadow 3px y glow rojo. Subtítulo: `— el filo del silencio —` italic.

Stats row: tres `.menu-stat` chips con border `#5a2020`, bg `linear-gradient(180deg, rgba(255,42,42,0.12), rgba(0,0,0,0.55))`:

- `🪙 <gold>`
- `💎 <gems>`
- `🏆 OLA <bestWave>`

Acciones (botones en columna, gap 12px):

- `⚔ COMBATIR` (primary, rojo)
- `🎓 TUTORIAL`
- `📖 CÓMO JUGAR`
- `🌟 HABILIDADES`
- `🎨 TIENDA · SKINS`

### 5.2 Tienda / Shop (líneas 516-540, 731-747)

Tabs (línea 736-740): `CUERPO`, `ESPADA`, `AURA`, `💎`. Tab activa: bg `linear-gradient(180deg, rgba(255,42,42,0.3), rgba(139,0,0,0.4))`, border var(--red), glow rojo.

Shop-item card (517-540):

- bg `linear-gradient(180deg, rgba(255,42,42,0.05), rgba(0,0,0,0.5))`
- border 2px `#5a3030`
- border-radius 12px, padding 12px
- hover: `transform: translateY(-1px)`
- `.equipped`: border var(--gold), `box-shadow: 0 0 14px rgba(255, 213, 74, 0.5)`
- `.owned`: border `#4caf50`, `box-shadow: 0 0 8px rgba(76,175,80,0.3)`

Layout interno: preview 50×60 + info (name dorado, desc gris claro `#d0c0c0`, cost dorado).

### 5.3 Wave clear / buff cards (líneas 433-453, 702-712)

Modal title cambia a `¡OLEADA N SUPERADA!` (1956). Stats grid 2×2: oleada / combo máx / bajas / oro. Después texto dorado `ELIGE UNA BENDICIÓN` y 3 cards.

`.lvlup-card` (434-453):

- bg `linear-gradient(180deg, #2a1810, #1a0808)` (rojo muy oscuro)
- border 2px var(--red), border-radius 12px, padding 12px 14px
- box-shadow `0 3px 0 #000, 0 0 10px rgba(255,42,42,0.2)`
- hover: `box-shadow: 0 3px 0 #000, 0 0 18px rgba(255,42,42,0.55)`
- active: `transform: translateY(2px)`

Layout interno: `.lvlup-icon` (32px, drop-shadow), `.lvlup-name` (Russo One 16px gold), `.lvlup-desc` (Inter 12px `#f0d0d0`).

Botón secundario: `RETIRARSE (guardar oro)`.

### 5.4 Defeat / Game Over (líneas 382-403, 691-700)

```css
.defeat-text {
  font-family: 'Black Ops One', 'Impact', sans-serif;
  font-size: clamp(30px, 8.5vw, 76px);
  color: var(--red);
  letter-spacing: clamp(2px, 0.8vw, 6px);
  text-shadow:
    0 0 40px #ff0000,
    0 0 14px #ff5050,
    4px 4px 0 #000;
  animation: defeatIn 1.4s ease-out forwards;
}
@keyframes defeatIn {
  0% {
    opacity: 0;
    transform: scale(2) rotate(-10deg);
  }
  60% {
    opacity: 1;
    transform: scale(1) rotate(0);
  }
  100% {
    opacity: 1;
    transform: scale(1) rotate(0);
  }
}
```

Modal-box del defeat es transparente sin border ni shadow (override inline en 692). Contiene: texto, grid de stats, botones `⚔ REINTENTAR` (primary) + `VOLVER`.

### 5.5 Damage popups (líneas 275-292)

```css
.dmg-pop {
  position: absolute;
  pointer-events: none;
  z-index: 8;
  font-family: 'Russo One', sans-serif;
  font-size: 20px;
  color: #fff;
  text-shadow:
    2px 2px 0 #000,
    0 0 6px #000;
  animation: dmgFloat 0.7s ease-out forwards;
  letter-spacing: 1px;
}
.dmg-pop.crit {
  color: var(--red);
  font-size: 28px;
  text-shadow:
    2px 2px 0 #000,
    0 0 12px rgba(255, 42, 42, 0.9);
}
@keyframes dmgFloat {
  0% {
    opacity: 0;
    transform: translate(0, 0) scale(0.5);
  }
  25% {
    opacity: 1;
    transform: translate(0, -8px) scale(1.2);
  }
  100% {
    opacity: 0;
    transform: translate(0, -36px) scale(1);
  }
}
```

Vida útil 700ms (línea 1929). MAX_DMG_POPS = 14 (línea 1914), límite duro × 1.5 = 21 incluso para crits.

### 5.6 Tutorial banner (líneas 554-577)

```css
.tut-hint {
  position: absolute;
  top: calc(78px + var(--safe-top, 0px));
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(180deg, rgba(40, 10, 10, 0.95), rgba(0, 0, 0, 0.95));
  border: 2px solid var(--gold);
  color: #fff;
  padding: clamp(10px, 3vw, 14px) clamp(14px, 4vw, 22px);
  border-radius: 12px;
  font-family: 'Russo One', sans-serif;
  letter-spacing: 1px;
  font-size: clamp(11px, 3vw, 14px);
  line-height: 1.5;
  text-align: center;
  text-shadow: 1px 1px 0 #000;
  box-shadow:
    0 0 24px rgba(255, 213, 74, 0.5),
    0 4px 14px rgba(0, 0, 0, 0.85);
  z-index: 25;
  max-width: calc(100% - 24px);
  width: max-content;
  pointer-events: none;
  animation: tutFade 0.35s ease-out;
}
.tut-hint b {
  color: var(--gold);
}
```

10 hints rotando con duración en frames (1147-1158).

### 5.7 Toast (líneas 579-596)

```css
.toast {
  position: absolute;
  bottom: 100px;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(180deg, rgba(40, 10, 10, 0.95), rgba(0, 0, 0, 0.95));
  border: 2px solid var(--red);
  color: var(--gold);
  padding: 12px 20px;
  border-radius: 10px;
  font-family: 'Russo One', sans-serif;
  letter-spacing: 2px;
  font-size: 14px;
  text-shadow: 1px 1px 0 #000;
  box-shadow:
    0 0 20px rgba(255, 42, 42, 0.4),
    0 4px 12px rgba(0, 0, 0, 0.8);
}
```

Vida 2500ms con fade in/out (animación toastIn).

### 5.8 Stats grid (defeat / wave clear) (líneas 336-354)

```css
.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin: 14px 0;
}
.stat-cell {
  background: linear-gradient(180deg, rgba(255, 42, 42, 0.06), rgba(0, 0, 0, 0.5));
  border: 2px solid #4a3030;
  border-radius: 10px;
  padding: 10px 6px;
}
.stat-cell .v {
  font-family: 'Russo One';
  font-size: 24px;
  color: var(--gold);
}
.stat-cell .l {
  font-family: 'Inter' w800;
  font-size: 11px;
  color: #c0a0a0;
  text-transform: uppercase;
}
```

### 5.9 Skill grid (Habilidades modal) (líneas 455-514)

- `.skill-item` border `#5a3030` por defecto, owned: border `#4caf50` + glow verde, equipped: border var(--gold) + glow dorado.
- `.skill-tag` mini-pill arriba-derecha: `EQ` (gold bg, black text), `✓` (green bg, white text), `💎` premium (red bg, glow rojo).
- `.equip-slots` (492-509): caja con dos slots circulares 64px. Empty: dashed `#888`. Filled: border var(--gold), radial bg `#555 → #222`, glow dorado.

### 5.10 Botones (.btn) (líneas 356-380)

- **Default**: `linear-gradient(180deg, #3a3a3a, #1a1a1a)`, border 2px `#888`, color white, `box-shadow: 0 4px 0 #000, inset 0 1px 0 rgba(255,255,255,0.1)`.
- **`.primary`**: `linear-gradient(180deg, #ff3030, #8b0000)`, border var(--gold), `box-shadow: 0 4px 0 #4a0000, 0 0 18px rgba(255,42,42,0.45)`.
- **Active state**: baja 3px (`transform: translateY(3px)`), reduce shadow. Transition 0.05s.
- **Disabled**: opacity 0.4, cursor not-allowed.

### 5.11 Close button (.close-btn) (líneas 542-552)

```css
.close-btn {
  position: absolute;
  top: 10px;
  right: 12px;
  background: rgba(255, 42, 42, 0.15);
  border: 2px solid var(--red);
  color: var(--red);
  width: 30px;
  height: 30px;
  font-size: 18px;
  font-weight: 900;
  border-radius: 50%;
  box-shadow: 0 0 8px rgba(255, 42, 42, 0.4);
}
```

---

## 6. Animaciones CSS

| Keyframe   | Líneas  | Duración | Easing    | Forwards |
| ---------- | ------- | -------- | --------- | -------- |
| `bump`     | 139-143 | 0.2s     | (default) | no       |
| `bannerIn` | 269-273 | 1.8s     | ease-out  | yes      |
| `dmgFloat` | 288-292 | 0.7s     | ease-out  | yes      |
| `defeatIn` | 399-403 | 1.4s     | ease-out  | yes      |
| `tutFade`  | 574-577 | 0.35s    | ease-out  | no       |
| `toastIn`  | 592-596 | 2.5s     | ease-out  | yes      |

Transitions:

- `.hp-fill width` 0.18s
- `.lvlup-card transform/box-shadow` 0.05s, 0.1s
- `.skill-item transform/box-shadow` 0.05s, 0.1s
- `.btn` all 0.05s
- `.shop-item transform` 0.05s

Animations en JS-driven loops (no CSS):

- **Camera shake**: amplitudes 5 (default hit), 10 (kill normal), 26 (explosión). Aplicada en `render()` línea 3676-3679: `shx = (Math.random()-0.5) * cameraShake`.
- **SlowMo**: 10 frames tras explosión (1269), `tickMul = slowMo > 0 ? 0.4 : 1.0`.
- **HitFlash**: blanco sobre stickman/obstáculo durante 4-8 frames.

---

## 7. Iconos / emojis

### 7.1 HUD / botones

| Emoji | Ubicación                                |
| ----- | ---------------------------------------- |
| `⚔`   | attack-btn, btn COMBATIR, btn REINTENTAR |
| `🏹`  | bow-btn                                  |
| `🪙`  | gold-info, menu-stat, gold costs         |
| `💎`  | gems, shop tab, premium tag              |
| `🏆`  | bestWave menu                            |
| `🎓`  | btn TUTORIAL                             |
| `📖`  | btn CÓMO JUGAR                           |
| `🌟`  | btn HABILIDADES                          |
| `🎨`  | btn TIENDA · SKINS                       |
| `✕`   | close-btn                                |

### 7.2 Skills (937-949)

| ID           | Emoji | Nombre          |
| ------------ | ----- | --------------- |
| combo3       | ✊    | COMBO TRIPLE    |
| shield       | 🛡    | PIEL DE ACERO   |
| vampire      | 🩸    | SED DE SANGRE   |
| golden       | 🪙    | TOQUE DE ORO    |
| cdReduce     | ⏱     | MENTE FRÍA      |
| kiBlast      | 💥    | KI BLAST        |
| dash         | 💨    | DASH FANTASMA   |
| groundPound  | 👊    | GOLPE SÍSMICO   |
| swordTornado | 🌪    | TORNADO DE FILO |
| heal         | ✨    | CURACIÓN        |
| finalFlash   | ☀️    | DESTELLO FINAL  |

### 7.3 Wave buffs (1933-1942)

| ID        | Emoji | Nombre        |
| --------- | ----- | ------------- |
| dmg       | ⚔️    | FILO AFILADO  |
| atkSpeed  | ⚡    | MANOS RÁPIDAS |
| crit      | 🎯    | OJO ASESINO   |
| hpMax     | ❤️    | PIEL DURA     |
| regen     | ✨    | REGENERACIÓN  |
| knockback | 💢    | GOLPE PESADO  |
| gold      | 🪙    | CODICIA       |
| heal      | 🍖    | BANQUETE      |

---

## 8. AURA_SKINS (líneas 930-936)

```javascript
const AURA_SKINS = {
  yellow: { name: 'AURA DORADA', color: '#ffd54a', cost: 0 },
  red: { name: 'AURA SANGRE', color: '#ff3030', cost: 150 },
  blue: { name: 'AURA HIELO', color: '#1ae0ff', cost: 250 },
  purple: { name: 'AURA OSCURA', color: '#9c27b0', cost: 15, premium: true },
  rainbow: { name: 'AURA PRISMA', color: 'rainbow', cost: 30, premium: true },
}
```

**Rainbow detection** (líneas 3638, 3653-3654, 3180, 3227, 3269, 3294, 1908): cuando `color === 'rainbow'`, se calcula dinámicamente:

```javascript
const c = aura === 'rainbow' ? `hsl(${(performance.now() * 0.2) % 360}, 90%, 60%)` : aura
```

La velocidad varía por contexto: `0.2` para aura del jugador, `0.3` para estelas de espada y chispas.

**Función drawAura** (3649-3663): solo se pinta cuando `combo > 0` o `tornadoTimer > 0`. Intensidad escala con combo: `Math.min(1.4, 0.5 + combo * 0.05)`. Radio `60 * CAM_ZOOM * intensity`. Radial gradient del color de aura al transparente, alpha 0.5.

---

## 9. drawStickman — orden de pintado (líneas 2372-2555)

Orden exacto dentro del `ctx.save() … ctx.restore()`:

1. **Setup transform**: traslada al pie central, aplica flip horizontal si `perfilX < 0`.
2. **Lean al moverse** (2403-2412): rota un poco el cuerpo según `vx, vy` cuando no está atacando, máx `0.18 rad`.
3. **Cálculos de proporciones**: head r=8, torso h=26, piernas 18+18, brazos 14+14 (todo `* scale`).
4. **Movimiento secundario**: bob vertical, hipSway, torsoTwist, headOffset, breath idle.
5. **Espada/arco en la espalda** (2459-2468): solo si NO está siendo usada en el ataque actual. `drawSwordOnBack` (3128) y `drawBowOnBack` (3083). El jugador siempre tiene `hasBow: true`.
6. **Piernas** (2470-2480): `drawTwoBoneLimb` con swing si camina. Si attack === `kick`, una pierna usa `drawKickLeg`.
7. **Torso (línea base)** (2484-2488): line desde pelvis a hombros con `strokeStyle = C`.
8. **Ropa** (2490-2496): `drawClothing` (2643) si `opts.clothing` existe. Cubre el centro del torso (incluido el "centro" de la espada en la espalda — por eso la espada solo se ve en los extremos).
9. **Cuello** (2498-2502): pequeña elipse `r = 4 * scale` en hombros.
10. **Cabeza** (2504-2519):
    - Círculo relleno `headR` con color `C`.
    - Stroke borde más oscuro lineWidth `2 * scale`.
    - **Ojo blanco direccional** (2513-2519): solo si color !== `#e0e0e0` && color !== `#fff`. Posición: `headC.x + headR * 0.4, headC.y - headR * 0.1`. Radio `headR * 0.22`. Color `#fff`. Como el cuerpo entero está flipped horizontalmente cuando mira a la izquierda, el ojo "mira al frente" automáticamente sin lógica adicional.
11. **Accesorio** (2521-2524): `drawAccessory` con todas las variantes.
12. **Brazos** (2526-2552):
    - Si attack !== 0, dispatch a `drawSlashArm`, `drawChopArms`, `drawUppercutArm`, `drawSpinArms`, `drawBowAttack`, o disposición de kick.
    - Si idle: `drawTwoBoneLimb` con swings sinusoidales en ambos brazos.

### 9.1 Swing trail / estela (color de aura)

Las estelas se dibujan dentro de cada función de ataque:

- **drawSlashArm** (3178-3190): condición `progress > 0.45 && progress < 0.78`. lineWidth `6 * scale`. globalAlpha `0.7 - (progress - 0.45) * 1.8`. Arco `armLen * 0.95` con ángulos `swordAng - π/2 ± offset * armSide`.
- **drawChopArms** (3225-3235): condición `progress > 0.40 && progress < 0.70`. lineWidth `8 * scale`. Línea recta vertical de 30 a 80 unidades en `dirAngle`.
- **drawUppercutArm** (3267-3276): arco invertido. lineWidth `7 * scale`. Alpha `0.7 - (progress - 0.35) * 1.6`.
- **drawSpinArms** (3294-3301): anillo continuo. lineWidth `8 * scale`. Alpha `0.5 + 0.3 * Math.sin(progress * π)`.

Color extraído siempre con la misma fórmula:

```javascript
const aura = AURA_SKINS[state.cosmetics.aura.equipped].color
const c = aura === 'rainbow' ? `hsl(${(performance.now() * 0.3) % 360},90%,60%)` : aura
ctx.strokeStyle = c
```

### 9.2 hurtFlash / iframes flicker

```javascript
flash: player.hurtFlash > 0 || (player.iframes > 0 && Math.floor(player.iframes / 4) % 2 === 0)
```

Color → `#fff` durante el flash. Línea 3727.

### 9.3 Enemy HP bar (3748-3753)

Solo cuando `e.hp < e.hpMax`. Dimensiones `36 * e.scale * CAM_ZOOM` ancho × 4px alto, posicionado `80 * e.scale * CAM_ZOOM` por encima del enemy. Bg `rgba(0,0,0,0.7)`, fill `#ff5050`.

### 9.4 Sombra del actor (drawShadow 3665-3671)

Elipse negra `rgba(0,0,0,0.5)` debajo de cada actor: `16 * scale * CAM_ZOOM` radio X, `5 * CAM_ZOOM` radio Y, offset Y `4 * CAM_ZOOM`.

---

## 10. Catálogos completos

### 10.1 CHAR_SKINS (12 skins, líneas 874-914)

`default`, `ninja`, `monk`, `samurai`, `greenSamurai`, `bambooMonk`, `iceKing`, `knight`, `jester`, `cyberpunk`, `demon`, `robot`, `shadow`. Costos van de 0 (default) a 2000 (knight) en oro, premium con 25-60 gemas.

Cada skin define: `color` (cuerpo/cabeza), opcional `armColor`, opcional `legColor`, `clothing` (tunic/wrap/robe/samurai/tank/plate/cloak), opcional `clothingColor`, y `accessory`.

### 10.2 WEAPONS (9 armas, líneas 917-927)

| ID       | Color blade | dmg  | atkSpeed | costo |
| -------- | ----------- | ---- | -------- | ----- |
| katana   | `#cfd8dc`   | 1.0  | 1.0      | 0     |
| claymore | `#b0bec5`   | 1.35 | 0.85     | 400   |
| axe      | `#d68a3a`   | 1.45 | 0.9      | 600   |
| hammer   | `#888`      | 1.6  | 0.7      | 900   |
| scythe   | `#222`      | 1.25 | 1.0      | 500   |
| dual     | `#cfd8dc`   | 0.7  | 1.7      | 350   |
| plasma   | `#1ae0ff`   | 1.3  | 1.0      | 35💎  |
| ki       | `#ffd54a`   | 1.5  | 1.0      | 50💎  |
| void     | `#9c27b0`   | 1.7  | 1.0      | 80💎  |

### 10.3 ENEMY_TYPES (líneas 1074-1084)

| Tipo    | Color     | Accessory  | Clothing |
| ------- | --------- | ---------- | -------- |
| grunt   | `#7be0c4` | none       | tunic    |
| brute   | `#5aa890` | horns      | tank     |
| ninja   | `#1f3a4a` | headband   | wrap     |
| spear   | `#a06820` | spear      | tunic    |
| dual    | `#9c4a4a` | dualBlades | tank     |
| berserk | `#d40000` | rage       | tank     |
| mage    | `#5a30b0` | staff      | robe     |
| heavy   | `#383840` | helm       | plate    |
| boss    | `#9c27b0` | crown      | samurai  |

---

## 11. Constantes / behaviors notables

- **Camera shake amplitudes**: 5 (golpe a obstáculo / kill heavy), 10 (kill normal), 26 (explosión).
- **Crit chance**: base 5% (`0.05`), buff `crit` (+15% por nivel de OJO ASESINO). Multiplicador crítico fijo `2.0` (líneas 971-972).
- **Combo aura intensity**: `0.5 + combo * 0.05`, capped at `1.4`. tornadoTimer override: `1.6`.
- **Save key**: `'stickFighter_v3'` (línea 830).
- **MAX_DMG_POPS**: 14 simultáneos (línea 1914), límite duro × 1.5 = 21 incluso para crits.
- **MAX_PARTICLES**: 220 (líneas 1234, 1272, 1881).
- **Default cosmetics equipados**: char `default`, sword `katana`, aura `yellow` (líneas 836-838).

---

## 12. Hallazgos clave para diseño

1. **Paleta deliberadamente reducida**: rojo (`#ff2a2a`/`#8b0000`) + dorado (`#ffd54a`) sobre `#1a1f24` con gradientes hacia `#0e1317`. Casi toda la UI rota entre estos 5 hex.

2. **Tres familias de fuente**: Black Ops One (titulares), Russo One (HUD/labels), Inter (texto descriptivo).

3. **Piso del canvas claro/industrial** (`#c8ccd0 → #9aa0a6`), no oscuro — contrasta intencionalmente con el HUD oscuro y los stickmen negros. **Este es el cambio visual más grande respecto a la nueva versión que actualmente está pintando piso oscuro.**

4. **Stickman pipeline**: pinta en orden trasero(espada/arco) → piernas → torso → ropa → cuello → cabeza+ojo → accesorio → brazos. La ropa "tapa" el centro de la espada de la espalda intencionalmente.

5. **Estelas (swing trails)**: toman color del aura equipada en runtime, con sentinel `'rainbow'` que genera HSL dinámico.

6. **Animaciones CSS** todas catalogadas (bump, bannerIn, dmgFloat, defeatIn, tutFade, toastIn) — duraciones cortas (0.2-2.5s), todas con `ease-out`.
