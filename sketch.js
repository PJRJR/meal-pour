// Meal Pour
// Project 2: Data Visualization
// Data: nutrients tab of the linked Google Sheet, with nutrients.csv as a backup
const Engine = Matter.Engine;
const Bodies = Matter.Bodies;
const Composite = Matter.Composite;

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1HBDJWs3sQs8OqgBQUYZVsfFln9WIZQro7AlsMCJvsQU/gviz/tq?tqx=out:csv&sheet=nutrients";
const LOCAL_FILE = "nutrients.csv";

const CANVAS_W = 960;
const CANVAS_H = 550;
const BALL_R = 9;
const BIN_INNER_W = 120;
const WALL_T = 10;
const FLOOR_T = 14;
const FLOOR_Y = 450;
const WALL_H = 260;
const DROP_Y = 135;
const DROP_EVERY = 2;
const MAX_FOODS = 6;
const BIN_FULL = 100;

// FDA daily values for a 2,000 calorie diet (see footer link)
// limit: true means stay under it, false means it is a goal to reach
const NUTRIENTS = [
  { key: "cal", label: "Calories", unit: "kcal", daily: 2000, limit: true },
  { key: "protein", label: "Protein", unit: "g", daily: 50, limit: false },
  { key: "fat", label: "Fat", unit: "g", daily: 78, limit: true },
  { key: "carbs", label: "Carbs", unit: "g", daily: 275, limit: true },
  { key: "fiber", label: "Fiber", unit: "g", daily: 28, limit: false },
];

const BINS_W = NUTRIENTS.length * BIN_INNER_W + (NUTRIENTS.length + 1) * WALL_T;
const BINS_LEFT = (CANVAS_W - BINS_W) / 2;

const FOOD_COLORS = [
  "#e4572e",
  "#17a2b8",
  "#f2b705",
  "#6a994e",
  "#8e6bbf",
  "#3d5a80",
];

// Each name needss to match the Food column of the sheet
const FOOD_LIST = [
  { name: "Hamburger" },
  { name: 'Pizza 14" diam.', label: "Pizza" },
  { name: "French-fried", label: "French fries" },
  { name: "Mac and cheese" },
  { name: "Spaghetti with meat sauce" },
  { name: "Eggs Scrambled or fried", label: "Eggs" },
  { name: "Oatmeal" },
  { name: "Roasted chicken" },
  { name: "Salmon" },
  { name: "Broccoli" },
  { name: "Lentils" },
  { name: "Banana" },
  { name: "Apples" },
  { name: "Cherry Pie" },
  { name: "Ice cream", measure: "1 cup" },
  { name: "Doughnuts" },
  { name: "Potato chips" },
  { name: "Almonds" },
];

let engine;
let walls = [];
let bins = [];
let balls = [];

let allFoods = [];
let foodChoices = [];
let plate = [];

let usingLocal = false;
let foodButtons = [];
let dataState = "loading";

let foodColors = [];
let hoverBall = null;
let legendHover = -1;
let focusFood = -1;

function setup() {
  let cnv = createCanvas(CANVAS_W, CANVAS_H);
  cnv.parent("sketch-holder");
  textFont("Arial");

  for (let i = 0; i < FOOD_COLORS.length; i++) {
    foodColors.push(color(FOOD_COLORS[i]));
  }

  // sleeping keeps the piles still once balls settle
  engine = Engine.create({
    enableSleeping: true,
    positionIterations: 10,
    velocityIterations: 8,
  });
  engine.gravity.y = 1.1;
  makeWalls();

  for (let i = 0; i < NUTRIENTS.length; i++) {
    bins.push(new Bin(i, NUTRIENTS[i]));
  }

  document.getElementById("clear-btn").addEventListener("click", clearBins);

  // Google Sheet first, nutrients.csv if that fails
  loadTable(SHEET_URL, "csv", "header", gotData, useLocalFile);
}

function draw() {
  Engine.update(engine, 1000 / 60);

  if (frameCount % DROP_EVERY === 0) {
    for (let i = 0; i < bins.length; i++) {
      bins[i].dropNext();
    }
  }
  removeStrays();

  background(255);
  checkHover();

  for (let i = 0; i < bins.length; i++) {
    bins[i].showInside();
  }
  for (let i = 0; i < balls.length; i++) {
    balls[i].show();
  }
  drawWalls();
  for (let i = 0; i < bins.length; i++) {
    bins[i].showOverlay();
    bins[i].showLabel();
  }

  drawLegend();
  drawEmptyMessage();
  drawTooltip();
}

function gotData(t) {
  allFoods = [];
  const rows = t.getRows();
  for (let r = 0; r < rows.length; r++) {
    allFoods.push({
      name: getCell(rows[r], 0),
      measure: getCell(rows[r], 1),
      cal: toNumber(getCell(rows[r], 3)),
      protein: toNumber(getCell(rows[r], 4)),
      fat: toNumber(getCell(rows[r], 5)),
      sat: toNumber(getCell(rows[r], 6)),
      fiber: toNumber(getCell(rows[r], 7)),
      carbs: toNumber(getCell(rows[r], 8)),
    });
  }

  foodChoices = [];
  const missing = [];
  for (let i = 0; i < FOOD_LIST.length; i++) {
    const row = findRow(FOOD_LIST[i]);
    if (row === null) {
      missing.push(FOOD_LIST[i].name);
    } else {
      let label = FOOD_LIST[i].label;
      if (label === undefined) {
        label = row.name;
      }
      foodChoices.push({
        label: label.charAt(0).toUpperCase() + label.slice(1),
        measure: row.measure,
        cal: row.cal,
        protein: row.protein,
        fat: row.fat,
        sat: row.sat,
        carbs: row.carbs,
        fiber: row.fiber,
      });
    }
  }

  if (missing.length > 0 && !usingLocal) {
    console.warn("Not found in the Google Sheet data:", missing);
    useLocalFile();
    return;
  }
  if (foodChoices.length === 0) {
    dataFailed();
    return;
  }
  if (missing.length > 0) {
    setMessage("These foods were not found in the data: " + missing.join(", "));
  }

  makeButtons();
  dataState = "ready";
  const note = document.getElementById("data-source");
  if (usingLocal) {
    note.textContent =
      "The Google Sheet could not be reached, so this page is using nutrients.csv, a saved copy of the same data.";
  } else {
    note.textContent = "Data loaded live from the Google Sheet.";
  }
}

function useLocalFile() {
  if (usingLocal) {
    dataFailed();
    return;
  }
  usingLocal = true;
  loadTable(LOCAL_FILE, "csv", "header", gotData, dataFailed);
}
// just in case the dataset csv thing doesnt connect (i.e. internet goes out)
function dataFailed() {
  dataState = "error";
  setMessage(
    "Could not load the data. Open this page with Live Server or GitHub Pages, and check that nutrients.csv is in the same folder as index.html.",
  );
}

function getCell(row, column) {
  const value = row.arr[column];
  if (value === undefined || value === null) {
    return "";
  }
  return String(value).trim();
}

// "t" (trace) and blank cells become 0
function toNumber(text) {
  const n = parseFloat(text);
  if (isNaN(n)) {
    return 0;
  }
  return n;
}

function clean(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function findRow(item) {
  for (let i = 0; i < allFoods.length; i++) {
    const sameName = clean(allFoods[i].name) === clean(item.name);
    let sameMeasure = true;
    if (item.measure !== undefined) {
      sameMeasure = clean(allFoods[i].measure) === clean(item.measure);
    }
    if (sameName && sameMeasure) {
      return allFoods[i];
    }
  }
  return null;
}

function setMessage(text) {
  document.getElementById("status").textContent = text;
}

function makeButtons() {
  const holder = document.getElementById("food-buttons");
  holder.innerHTML = "";
  foodButtons = [];
  for (let i = 0; i < foodChoices.length; i++) {
    makeButton(holder, i);
  }
}

function makeButton(holder, index) {
  const food = foodChoices[index];
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = food.label;
  if (food.measure !== "") {
    const measure = document.createElement("span");
    measure.className = "measure";
    measure.textContent = " " + food.measure;
    button.appendChild(measure);
  }
  button.addEventListener("click", function () {
    addFood(index);
  });
  holder.appendChild(button);
  foodButtons.push(button);
}

// Grey out the foods that are not on the plate once it is full
function updateButtons() {
  const full = plate.length >= MAX_FOODS;
  for (let i = 0; i < foodButtons.length; i++) {
    let onPlate = false;
    for (let j = 0; j < plate.length; j++) {
      if (plate[j].food === foodChoices[i]) {
        onPlate = true;
      }
    }
    foodButtons[i].disabled = full && !onPlate;
  }
}

function addFood(index) {
  const food = foodChoices[index];

  let entry = null;
  for (let i = 0; i < plate.length; i++) {
    if (plate[i].food === food) {
      entry = plate[i];
    }
  }
  if (entry === null && plate.length >= MAX_FOODS) {
    return;
  }

  const counts = [];
  for (let i = 0; i < bins.length; i++) {
    const n = bins[i].nutrient;
    let count = Math.round(percent(food[n.key], n));
    count = Math.min(count, BIN_FULL - bins[i].total);
    counts.push(count);
  }
  setMessage("");

  if (entry === null) {
    entry = { food: food, servings: 0 };
    plate.push(entry);
  }
  entry.servings++;

  const colorNumber = plate.indexOf(entry);
  for (let i = 0; i < bins.length; i++) {
    bins[i].addBalls(colorNumber, counts[i]);
  }
  updateButtons();
}

function clearBins() {
  for (let i = 0; i < balls.length; i++) {
    Composite.remove(engine.world, balls[i].body);
  }
  balls = [];
  for (let i = 0; i < bins.length; i++) {
    bins[i].clear();
  }
  plate = [];
  setMessage("");
  updateButtons();
}

function plateTotal(key) {
  let sum = 0;
  for (let i = 0; i < plate.length; i++) {
    sum += plate[i].food[key] * plate[i].servings;
  }
  return sum;
}

function percent(amount, nutrient) {
  return (amount / nutrient.daily) * 100;
}

// One Bin per nutrient, with a line of balls waiting to drop
class Bin {
  constructor(index, nutrient) {
    this.index = index;
    this.nutrient = nutrient;
    this.left = BINS_LEFT + WALL_T + index * (BIN_INNER_W + WALL_T);
    this.centerX = this.left + BIN_INNER_W / 2;
    this.queue = [];
    this.total = 0;
    this.dropped = 0;
  }

  addBalls(colorNumber, count) {
    for (let i = 0; i < count; i++) {
      this.queue.push(colorNumber);
    }
    this.total += count;
  }

  clear() {
    this.queue = [];
    this.total = 0;
    this.dropped = 0;
  }

  dropNext() {
    if (this.queue.length === 0) {
      return;
    }
    const colorNumber = this.queue.shift();
    const spread = BIN_INNER_W / 2 - BALL_R - 6;
    const t = (this.dropped * 0.618) % 1;
    this.dropped++;
    const x = this.centerX + (t - 0.5) * 2 * spread;
    balls.push(new Ball(x, DROP_Y, colorNumber, this.index));
  }

  showInside() {
    noStroke();
    fill(245);
    rect(this.left, FLOOR_Y - WALL_H, BIN_INNER_W, WALL_H);

    fill(130);
    textAlign(LEFT, TOP);
    textStyle(NORMAL);
    textSize(10);
    text("100%", this.left + 4, FLOOR_Y - WALL_H + 3);
  }

  showOverlay() {
    if (plate.length === 0) {
      return;
    }
    const pct = Math.round(
      percent(plateTotal(this.nutrient.key), this.nutrient),
    );
    const n = this.nutrient;
    if ((n.limit && pct <= 100) || (!n.limit && pct < 100)) {
      return;
    }
    let c = color(46, 125, 50);
    let message = "GOAL MET";
    if (n.limit) {
      c = color(176, 0, 32);
      message = "OVER LIMIT";
    }
    const top = FLOOR_Y - WALL_H;
    noStroke();
    fill(red(c), green(c), blue(c), 35);
    rect(this.left, top, BIN_INNER_W, WALL_H);
    fill(c);
    rect(this.left, top, BIN_INNER_W, 24);
    fill(255);
    textAlign(CENTER, CENTER);
    textStyle(BOLD);
    textSize(13);
    text(message, this.centerX, top + 12);
  }

  showLabel() {
    noStroke();
    textAlign(CENTER, TOP);
    fill(30);
    textStyle(BOLD);
    textSize(15);
    text(this.nutrient.label, this.centerX, FLOOR_Y + 22);
    if (plate.length > 0) {
      const amount = plateTotal(this.nutrient.key);
      const pct = Math.round(percent(amount, this.nutrient));
      if (this.nutrient.limit && pct > 100) {
        fill(176, 0, 32);
      } else if (!this.nutrient.limit && pct >= 100) {
        fill(46, 125, 50);
      }
      textStyle(NORMAL);
      textSize(14);
      text(
        fmt(amount) + " " + this.nutrient.unit + " (" + pct + "%)",
        this.centerX,
        FLOOR_Y + 42,
      );
    }
    fill(110);
    textStyle(NORMAL);
    textSize(11);
    text(
      "1 ball = " + fmt2(this.nutrient.daily / 100) + " " + this.nutrient.unit,
      this.centerX,
      FLOOR_Y + 62,
    );
    text(
      "daily value: " + this.nutrient.daily + " " + this.nutrient.unit,
      this.centerX,
      FLOOR_Y + 77,
    );
  }
}

// The Matter.js body does the falling and stacking
class Ball {
  constructor(x, y, colorNumber, binIndex) {
    this.colorNumber = colorNumber;
    this.binIndex = binIndex;
    this.body = Bodies.circle(x, y, BALL_R, {
      restitution: 0.1,
      friction: 0.3,
      frictionAir: 0.02,
    });
    Composite.add(engine.world, this.body);
  }

  isOver(px, py) {
    const p = this.body.position;
    return dist(px, py, p.x, p.y) <= BALL_R + 2;
  }

  show() {
    const p = this.body.position;
    const c = foodColors[this.colorNumber];
    const faded = focusFood !== -1 && focusFood !== this.colorNumber;
    if (faded) {
      fill(red(c), green(c), blue(c), 50);
    } else {
      fill(c);
    }
    if (hoverBall === this) {
      stroke(0);
      strokeWeight(2);
    } else {
      stroke(255);
      strokeWeight(1);
    }
    circle(p.x, p.y, BALL_R * 2);
  }
}

function makeWalls() {
  const wallY = FLOOR_Y - WALL_H / 2;
  for (let i = 0; i <= NUTRIENTS.length; i++) {
    const x = BINS_LEFT + i * (BIN_INNER_W + WALL_T) + WALL_T / 2;
    walls.push({ x: x, y: wallY, w: WALL_T, h: WALL_H });
  }
  walls.push({
    x: CANVAS_W / 2,
    y: FLOOR_Y + FLOOR_T / 2,
    w: BINS_W,
    h: FLOOR_T,
  });

  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    const body = Bodies.rectangle(w.x, w.y, w.w, w.h, {
      isStatic: true,
      friction: 0.3,
    });
    Composite.add(engine.world, body);
  }
}

function drawWalls() {
  noStroke();
  fill(70);
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    rect(w.x - w.w / 2, w.y - w.h / 2, w.w, w.h);
  }
}

function removeStrays() {
  for (let i = balls.length - 1; i >= 0; i--) {
    if (balls[i].body.position.y > CANVAS_H + 100) {
      Composite.remove(engine.world, balls[i].body);
      balls.splice(i, 1);
    }
  }
}

function legendBox(i) {
  const col = i % 3;
  const row = Math.floor(i / 3);
  return {
    x: BINS_LEFT + col * (BINS_W / 3),
    y: 38 + row * 40,
    w: BINS_W / 3 - 8,
    h: 34,
  };
}

function checkHover() {
  hoverBall = null;
  for (let i = balls.length - 1; i >= 0; i--) {
    if (balls[i].isOver(mouseX, mouseY)) {
      hoverBall = balls[i];
      break;
    }
  }

  legendHover = -1;
  for (let i = 0; i < plate.length; i++) {
    const b = legendBox(i);
    if (
      mouseX >= b.x &&
      mouseX <= b.x + b.w &&
      mouseY >= b.y &&
      mouseY <= b.y + b.h
    ) {
      legendHover = i;
    }
  }

  if (hoverBall !== null) {
    focusFood = hoverBall.colorNumber;
  } else {
    focusFood = legendHover;
  }
}

function fmt(n) {
  return String(Number(n.toFixed(1)));
}

function fmt2(n) {
  return String(Number(n.toFixed(2)));
}

function plateName(entry) {
  if (entry.servings > 1) {
    return entry.food.label + " x" + entry.servings;
  }
  return entry.food.label;
}

function plateMeasure(entry) {
  if (entry.food.measure === "") {
    return "";
  }
  if (entry.servings > 1) {
    return entry.servings + " x " + entry.food.measure;
  }
  return entry.food.measure;
}

function drawLegend() {
  if (plate.length === 0) {
    return;
  }
  noStroke();
  fill(30);
  textAlign(LEFT, TOP);
  textStyle(BOLD);
  textSize(16);
  text("On the plate", BINS_LEFT, 10);

  for (let i = 0; i < plate.length; i++) {
    const b = legendBox(i);
    const faded = focusFood !== -1 && focusFood !== i;
    const c = foodColors[i];

    if (focusFood === i) {
      fill(0, 0, 0, 15);
      rect(b.x - 4, b.y - 4, b.w + 4, b.h + 6);
    }
    if (faded) {
      fill(red(c), green(c), blue(c), 50);
    } else {
      fill(c);
    }
    circle(b.x + 9, b.y + 11, 16);

    if (faded) {
      fill(160);
    } else {
      fill(30);
    }
    textStyle(BOLD);
    textSize(13);
    text(plateName(plate[i]), b.x + 24, b.y + 2);
    if (faded) {
      fill(180);
    } else {
      fill(110);
    }
    textStyle(NORMAL);
    textSize(11);
    text(plateMeasure(plate[i]), b.x + 24, b.y + 19);
  }
}

function drawEmptyMessage() {
  if (plate.length > 0) {
    return;
  }
  let message = "Choose a food above to start pouring";
  if (dataState === "loading") {
    message = "Loading nutrition data...";
  }
  if (dataState === "error") {
    message = "The data could not be loaded";
  }
  noStroke();
  fill(130);
  textAlign(CENTER, CENTER);
  textStyle(NORMAL);
  textSize(20);
  text(message, CANVAS_W / 2, 320);
}

function drawTooltip() {
  if (hoverBall === null) {
    return;
  }
  const entry = plate[hoverBall.colorNumber];
  if (entry === undefined) {
    return;
  }
  const n = NUTRIENTS[hoverBall.binIndex];
  const line1 = plateName(entry);
  const amount = entry.food[n.key] * entry.servings;
  const line2 =
    fmt(amount) +
    " " +
    n.unit +
    " " +
    n.label.toLowerCase() +
    " (" +
    Math.round(percent(amount, n)) +
    "% of daily value)";

  textSize(13);
  textStyle(BOLD);
  const w = max(textWidth(line1), textWidth(line2)) + 20;
  const h = 44;
  let x = mouseX + 14;
  if (x + w > CANVAS_W - 4) {
    x = mouseX - w - 14;
  }
  let y = mouseY - h - 10;
  if (y < 4) {
    y = mouseY + 16;
  }

  noStroke();
  fill(30, 30, 30, 235);
  rect(x, y, w, h, 4);
  fill(255);
  textAlign(LEFT, TOP);
  text(line1, x + 10, y + 7);
  textStyle(NORMAL);
  text(line2, x + 10, y + 25);
}
