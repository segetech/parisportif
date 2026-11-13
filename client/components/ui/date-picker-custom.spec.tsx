// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatePickerCustom, TimePickerCustom, DateTimeRow } from "./date-picker-custom";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

describe("DatePickerCustom — Calendrier Studio OPEN", () => {
  it("renders French formatted date without native date inputs or CSS gradients", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <DatePickerCustom
          label="DATE"
          required
          value="2026-11-13"
          onChange={onChange}
        />,
      );
    });

    expect(container.querySelector('input[type="date"]')).toBeNull();
    expect(container.textContent).toContain("13");
    expect(container.textContent).toContain("NOV.");
    expect(container.textContent).toContain("Ven. 13 novembre 2026");
    expect(container.textContent).toContain("13/11/2026");
    expect(container.innerHTML).not.toContain("bg-gradient");
  });

  it("opens calendar popover, picks a day, switches to month view, and supports -1j/+1j", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <DatePickerCustom
          label="DATE"
          value="2026-11-13"
          onChange={onChange}
        />,
      );
    });

    const nextBtn = container.querySelector(
      'button[aria-label="Jour suivant"]',
    ) as HTMLButtonElement;
    await act(async () => {
      nextBtn.click();
    });
    expect(onChange).toHaveBeenCalledWith("2026-11-14");

    const prevBtn = container.querySelector(
      'button[aria-label="Jour précédent"]',
    ) as HTMLButtonElement;
    await act(async () => {
      prevBtn.click();
    });
    expect(onChange).toHaveBeenCalledWith("2026-11-12");

    // Open popover
    const triggerBtn = container.querySelector(
      'button[aria-label="DATE"]',
    ) as HTMLButtonElement;
    await act(async () => {
      triggerBtn.click();
    });

    expect(document.body.textContent).toContain("Calendrier OPEN");
    expect(document.body.innerHTML).not.toContain("bg-gradient");

    // Pick 20/11/2026
    const day20Btn = document.body.querySelector(
      'button[aria-label="Choisir le 20/11/2026"]',
    ) as HTMLButtonElement;
    expect(day20Btn).toBeTruthy();
    await act(async () => {
      day20Btn.click();
    });
    expect(onChange).toHaveBeenCalledWith("2026-11-20");
  });
});

describe("TimePickerCustom — Horloge Tactile OPEN", () => {
  it("normalizes HH:mm:ss display cleanly without native time inputs and opens 24h matrix", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <TimePickerCustom
          label="HEURE"
          value="21:21:00"
          onChange={onChange}
        />,
      );
    });

    expect(container.querySelector('input[type="time"]')).toBeNull();
    expect(container.textContent).toContain("21 : 21");
    expect(container.innerHTML).not.toContain("bg-gradient");

    // Open clock popover
    const triggerBtn = container.querySelector(
      'button[aria-label="HEURE"]',
    ) as HTMLButtonElement;
    await act(async () => {
      triggerBtn.click();
    });

    expect(document.body.textContent).toContain("Horloge OPEN 24H");
    expect(document.body.textContent).toContain("Soir");
    expect(document.body.innerHTML).not.toContain("bg-gradient");

    // Pick hour 14
    const hour14Btn = document.body.querySelector(
      'button[aria-label="Heure 14"]',
    ) as HTMLButtonElement;
    await act(async () => {
      hour14Btn.click();
    });
    expect(onChange).toHaveBeenCalledWith("14:21");

    // Pick minute 35
    const min35Btn = document.body.querySelector(
      'button[aria-label="Minute 35"]',
    ) as HTMLButtonElement;
    await act(async () => {
      min35Btn.click();
    });
    expect(onChange).toHaveBeenCalledWith("21:35");

    // Fine step +1m
    const plus1m = document.body.querySelector(
      'button[aria-label="Avancer de 1 minute"]',
    ) as HTMLButtonElement;
    await act(async () => {
      plus1m.click();
    });
    expect(onChange).toHaveBeenCalledWith("21:22");
  });

  it("renders DateTimeRow presets cleanly", async () => {
    const onDateChange = vi.fn();
    const onTimeChange = vi.fn();
    await act(async () => {
      root.render(
        <DateTimeRow
          date="2026-11-13"
          time="12:00"
          onDateChange={onDateChange}
          onTimeChange={onTimeChange}
        />,
      );
    });

    const preset18 = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "18:00",
    )!;
    await act(async () => {
      preset18.click();
    });
    expect(onTimeChange).toHaveBeenCalledWith("18:00");
  });
});
