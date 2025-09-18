"use client";

import * as React from "react";

export function Counter() {
  const [count, setCount] = React.useState(0);

  return (
    <button
      className="px-4 py-2 font-bold text-white bg-blue-500 rounded hover:bg-blue-700"
      onClick={() => setCount((c) => c + 1)}
    >
      Count: {count}
    </button>
  );
}
