/**
 * Shared auth primitives (PasswordField, AuthSegmented, AuthDivider) back the
 * login / signup / reset / gate surfaces — assert their contract by role +
 * attributes so the tests don't depend on catalogue copy.
 */
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { PasswordField } from "@/components/auth/PasswordField";
import { AuthDivider, AuthSegmented } from "@/components/auth/AuthCard";

describe("PasswordField", () => {
  function Harness({ onValue }: { onValue: (v: string) => void }) {
    const [value, setValue] = useState("");
    return (
      <PasswordField
        id="pw"
        label="Password"
        value={value}
        onChange={(v) => {
          setValue(v);
          onValue(v);
        }}
        autoComplete="current-password"
      />
    );
  }

  it("starts masked, toggles visibility, and reports typed values", () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);

    const input = screen.getByLabelText("Password") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input.autocomplete).toBe("current-password");
    expect(input.required).toBe(true);

    const toggle = screen.getByRole("button");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.getAttribute("aria-label")).toBeTruthy();

    fireEvent.click(toggle);
    expect(input.type).toBe("text");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");

    fireEvent.change(input, { target: { value: "Hunter2!" } });
    expect(onValue).toHaveBeenLastCalledWith("Hunter2!");
  });

  it("disables the toggle with the input", () => {
    render(
      <PasswordField id="pw2" label="New" value="" onChange={() => {}} autoComplete="new-password" disabled />,
    );
    expect((screen.getByLabelText("New") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("AuthSegmented", () => {
  it("marks the active option and emits the other value when chosen", () => {
    const onChange = vi.fn();
    render(
      <AuthSegmented
        value="signup"
        onChange={onChange}
        options={[
          { value: "signup", label: "Create account" },
          { value: "login", label: "Sign in" },
        ]}
      />,
    );
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");

    fireEvent.mouseDown(tabs[1], { button: 0 });
    expect(onChange).toHaveBeenCalledWith("login");
  });
});

describe("AuthDivider", () => {
  it("exposes its label to assistive tech", () => {
    render(<AuthDivider label="or continue with email" />);
    expect(screen.getByRole("separator", { name: "or continue with email" })).toBeTruthy();
  });
});
