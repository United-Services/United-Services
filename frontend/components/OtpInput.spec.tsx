import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { useState } from "react"
import OtpInput from "./OtpInput"

// A thin controlled wrapper — OtpInput itself is fully controlled
// (value/onChange), so tests need somewhere to hold state exactly like a
// real caller (AdminMfaChallenge, AdminSecuritySection) would.
function Controlled({ onComplete }: { onComplete?: (value: string) => void }) {
  const [value, setValue] = useState("")
  return <OtpInput value={value} onChange={setValue} onComplete={onComplete} />
}

function boxes() {
  return screen.getAllByRole("textbox")
}

describe("OtpInput", () => {
  it("renders 6 boxes by default", () => {
    render(<Controlled />)
    expect(boxes()).toHaveLength(6)
  })

  it("does not call onComplete while the code is only partially entered", () => {
    const onComplete = vi.fn()
    render(<Controlled onComplete={onComplete} />)
    const inputs = boxes()

    fireEvent.change(inputs[0], { target: { value: "1" } })
    fireEvent.change(inputs[1], { target: { value: "2" } })
    fireEvent.change(inputs[2], { target: { value: "3" } })

    expect(onComplete).not.toHaveBeenCalled()
  })

  it("calls onComplete exactly once, with the full code, the moment the last digit is typed", () => {
    const onComplete = vi.fn()
    render(<Controlled onComplete={onComplete} />)
    const inputs = boxes()

    "12345".split("").forEach((digit, i) => {
      fireEvent.change(inputs[i], { target: { value: digit } })
    })
    expect(onComplete).not.toHaveBeenCalled()

    fireEvent.change(inputs[5], { target: { value: "6" } })

    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledWith("123456")
  })

  // Regression: pasting the full code (the most common real path — an
  // authenticator app's code gets copied, not hand-typed) must trigger
  // auto-submit exactly like typing the last digit does.
  it("calls onComplete when a full code is pasted into the first box", () => {
    const onComplete = vi.fn()
    render(<Controlled onComplete={onComplete} />)
    const inputs = boxes()

    fireEvent.paste(inputs[0], {
      clipboardData: { getData: () => "654321" },
    })

    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledWith("654321")
  })

  it("does not call onComplete for a partial paste", () => {
    const onComplete = vi.fn()
    render(<Controlled onComplete={onComplete} />)
    const inputs = boxes()

    fireEvent.paste(inputs[0], {
      clipboardData: { getData: () => "123" },
    })

    expect(onComplete).not.toHaveBeenCalled()
  })

  it("does not call onComplete again just from re-rendering with an already-complete value", () => {
    const onComplete = vi.fn()
    const { rerender } = render(
      <OtpInput value="123456" onChange={() => {}} onComplete={onComplete} />,
    )
    rerender(<OtpInput value="123456" onChange={() => {}} onComplete={onComplete} />)

    expect(onComplete).not.toHaveBeenCalled()
  })

  it("clearing a digit after completion means the next completion fires onComplete again", () => {
    const onComplete = vi.fn()
    render(<Controlled onComplete={onComplete} />)
    const inputs = boxes()

    "123456".split("").forEach((digit, i) => {
      fireEvent.change(inputs[i], { target: { value: digit } })
    })
    expect(onComplete).toHaveBeenCalledTimes(1)

    fireEvent.change(inputs[5], { target: { value: "" } })
    fireEvent.change(inputs[5], { target: { value: "9" } })

    expect(onComplete).toHaveBeenCalledTimes(2)
    expect(onComplete).toHaveBeenLastCalledWith("123459")
  })
})
