import assert from "node:assert/strict";
import {
  assertDatabaseIntegrity,
  assertNoFrontendErrors,
  clearFrontendErrors,
  click,
  element,
  fill,
  installErrorCollector,
  invoke,
  login,
} from "./support.mjs";

async function openCars() {
  await click("nav-cars");
  await click("cars-subtab-available");
  await (await $(".cars-page")).waitForDisplayed();
}

async function startBatch(count) {
  await openCars();
  await click("btn-add-car-batch");
  const countInput = await $("#batch-count-input");
  await countInput.waitForDisplayed();
  await click(`batch-count-${count}`);
  await browser.waitUntil(async () => Number(await countInput.getValue()) === count);
  await click("btn-create-batch-table");
  await (await element("batch-car-form")).waitForDisplayed();
  assert.equal((await $$('[data-testid^="batch-row-"]')).length, count);
}

async function fillBatch(prefix, count) {
  await fill("#batch-model-0", "BATCH E2E");
  await fill("#batch-year-0", "2026");
  await fill("#batch-color-0", "أبيض");
  await fill("#batch-purchase-0", "10000000");
  for (let index = 0; index < count; index += 1) {
    await fill(`#batch-num-${index}`, `${prefix}-${String(index + 1).padStart(2, "0")}`);
    await fill(`#batch-chassis-${index}`, `${prefix}-VIN-${String(index + 1).padStart(2, "0")}`);
  }
}

async function createSingleCar({ plate, chassis, purchase = "9000000" }) {
  await openCars();
  await click("btn-add-car");
  await fill("#car-model", "IDENTITY E2E");
  await fill("#car-year", "2026");
  await fill("#car-color", "أسود");
  await fill("#car-num", plate);
  await fill("#car-chassis", chassis);
  await fill("#car-purchase", purchase);
  await click("btn-save-car");
  await (await $("#car-form")).waitForExist({ reverse: true, timeout: 30_000 });
}

async function openCarByInternalNumber(carNumber) {
  await openCars();
  await click(`car-row-${carNumber}`);
  await (await $("#car-form")).waitForDisplayed();
}

describe("Real Tauri car batch atomicity and numeric identity", () => {
  before(async () => {
    await installErrorCollector();
    await login();
    const initial = await assertDatabaseIntegrity();
    assert.equal(initial.cars_total, 0);
  });

  beforeEach(clearFrontendErrors);

  afterEach(async () => {
    await assertNoFrontendErrors();
    await assertDatabaseIntegrity();
  });

  it("does not write a partial batch when a visible row is invalid", async () => {
    await startBatch(3);
    await fill("#batch-model-0", "INVALID BATCH");
    await fill("#batch-year-0", "2026");
    await fill("#batch-color-0", "أبيض");
    await fill("#batch-purchase-0", "5000000");
    await fill("#batch-num-0", "INVALID-BATCH-01");
    await fill("#batch-chassis-0", "INVALID-BATCH-VIN-01");
    await fill("#batch-num-1", "INVALID-BATCH-02");
    await fill("#batch-chassis-1", "INVALID-BATCH-VIN-02");
    await fill("#batch-num-2", "INVALID-BATCH-03");

    await click("btn-save-car");
    const matches = await invoke("e2e_car_matches", { platePrefix: "INVALID-BATCH" });
    assert.deepEqual(matches, []);

    await fill("#batch-chassis-2", "INVALID-BATCH-VIN-03");
    await click("btn-save-car");
    await (await $('[data-testid="batch-car-form"]')).waitForExist({ reverse: true, timeout: 30_000 });
    assert.equal(
      (await invoke("e2e_car_matches", { platePrefix: "INVALID-BATCH" })).length,
      3,
    );
  });

  it("adds 25 cars atomically and remains idempotent under a real double click", async () => {
    await startBatch(25);
    await fillBatch("E2E-BATCH", 25);

    const saveButton = await element("btn-save-car");
    await saveButton.doubleClick();
    await (await $('[data-testid="batch-car-form"]')).waitForExist({ reverse: true, timeout: 45_000 });

    const cars = await invoke("e2e_car_matches", { platePrefix: "E2E-BATCH" });
    assert.equal(cars.length, 25);
    assert.equal(new Set(cars.map((car) => car.id)).size, 25);
    assert.equal(new Set(cars.map((car) => car.purchase_operation_id)).size, 25);
    assert.ok(cars.every((car) => car.purchase_operation_id));
  });

  it("allows duplicate chassis and duplicate plates while isolating expenses by car_id", async () => {
    await createSingleCar({ plate: "E2E-ID-A", chassis: "E2E-DUP-CHASSIS", purchase: "7000000" });

    await openCars();
    await click("btn-add-car");
    await fill("#car-model", "DUP CHASSIS NEW");
    await fill("#car-year", "2026");
    await fill("#car-color", "أحمر");
    await fill("#car-num", "E2E-ID-B");
    await fill("#car-chassis", "E2E-DUP-CHASSIS");
    await fill("#car-purchase", "8000000");
    await click("btn-save-car");
    await (await $("#car-form")).waitForExist({ reverse: true, timeout: 30_000 });

    await createSingleCar({ plate: "E2E-DUP-PLATE", chassis: "E2E-PLATE-VIN-A", purchase: "9000000" });
    await openCars();
    await click("btn-add-car");
    await fill("#car-model", "DUP PLATE NEW");
    await fill("#car-year", "2026");
    await fill("#car-color", "أزرق");
    await fill("#car-num", "E2E-DUP-PLATE");
    await fill("#car-chassis", "E2E-PLATE-VIN-B");
    await fill("#car-purchase", "9500000");
    await click("btn-save-car");
    await (await $("#car-form")).waitForExist({ reverse: true, timeout: 30_000 });

    const chassisMatches = await invoke("e2e_car_matches", {
      chassisNumber: "E2E-DUP-CHASSIS",
    });
    assert.equal(chassisMatches.length, 2);
    assert.equal(new Set(chassisMatches.map((car) => car.id)).size, 2);
    assert.deepEqual(chassisMatches.map((car) => car.purchase_price), ["7000000", "8000000"]);

    const plateMatches = await invoke("e2e_car_matches", { plateNumber: "E2E-DUP-PLATE" });
    assert.equal(plateMatches.length, 2);
    assert.equal(new Set(plateMatches.map((car) => car.car_number)).size, 2);

    const newChassisCar = chassisMatches.at(-1);
    await openCarByInternalNumber(newChassisCar.car_number);
    await fill("#car-expense-description", "مصروف للشاصي المكرر");
    await fill("#car-expense-amount", "250000");
    await click("btn-add-car-expense");
    await click("btn-save-car");
    await (await $("#car-form")).waitForExist({ reverse: true, timeout: 30_000 });

    const oldChassisExpenses = await invoke("e2e_car_expense_snapshot", {
      carId: chassisMatches[0].id,
    });
    const newChassisExpenses = await invoke("e2e_car_expense_snapshot", {
      carId: newChassisCar.id,
    });
    assert.deepEqual(oldChassisExpenses, []);
    assert.equal(newChassisExpenses.length, 1);
    assert.equal(newChassisExpenses[0].description, "مصروف للشاصي المكرر");

    const newPlateCar = plateMatches.at(-1);
    await openCarByInternalNumber(newPlateCar.car_number);
    await fill("#car-expense-description", "مصروف للوحة المكررة");
    await fill("#car-expense-amount", "300000");
    await click("btn-add-car-expense");
    await click("btn-save-car");
    await (await $("#car-form")).waitForExist({ reverse: true, timeout: 30_000 });

    let newPlateExpenses = await invoke("e2e_car_expense_snapshot", { carId: newPlateCar.id });
    assert.equal(newPlateExpenses.length, 1);
    assert.deepEqual(
      await invoke("e2e_car_expense_snapshot", { carId: plateMatches[0].id }),
      [],
    );

    await openCarByInternalNumber(newPlateCar.car_number);
    const expenseRow = await element(`car-expense-row-${newPlateExpenses[0].id}`);
    await expenseRow.moveTo();
    await click(`delete-car-expense-${newPlateExpenses[0].id}`);
    await click("btn-save-car");
    await (await $("#car-form")).waitForExist({ reverse: true, timeout: 30_000 });
    newPlateExpenses = await invoke("e2e_car_expense_snapshot", { carId: newPlateCar.id });
    assert.ok(newPlateExpenses.some((row) => row.is_reversed));
    assert.equal(
      newPlateExpenses.filter((row) => !row.is_reversed && row.reverses_car_expense_id == null)
        .length,
      0,
    );
  });
});
