/**
 * Spinner Component
 * Reusable loading spinner with consistent green styling
 */

'use client';

import React from 'react';
import styles from './Spinner.module.css';

interface SpinnerProps {
  /** Whether to show full-screen overlay backdrop */
  fullScreen?: boolean;
  /** Size of the spinner: 'sm' (32px), 'md' (48px), 'lg' (64px) */
  size?: 'sm' | 'md' | 'lg';
  /** Optional message to display below spinner */
  message?: string;
}

const sizeMap = {
  sm: { width: 32, border: 4 },
  md: { width: 48, border: 5 },
  lg: { width: 64, border: 6 },
};

export default function Spinner({ fullScreen = false, size = 'md', message }: SpinnerProps) {
  const { width, border } = sizeMap[size];

  const spinnerElement = (
    <div className={styles.spinnerContainer}>
      <div
        className={styles.spinner}
        style={{
          width: `${width}px`,
          height: `${width}px`,
          borderWidth: `${border}px`,
          marginBottom: message ? '12px' : '0',
        }}
      />
      {message && (
        <p className={styles.message}>{message}</p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className={styles.fullScreenOverlay}>
        {spinnerElement}
      </div>
    );
  }

  return (
    <div className={styles.inlineWrapper}>
      {spinnerElement}
    </div>
  );
}

/**
 * Inline spinner for use within text or buttons
 */
export function InlineSpinner({ size = 16 }: { size?: number }) {
  return (
    <span
      className={styles.inlineSpinner}
      style={{
        width: `${size}px`,
        height: `${size}px`,
      }}
    />
  );
}
