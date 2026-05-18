import { useNet } from "../../../net/netStore";

// Сетевой гейт для action'ов. В sp/host выполняем функцию обычным путём; в client
// просто шлём команду хосту и возвращаем undefined (UI пока не дождётся ответа).
// Это даёт минимальную инвазию в существующий код — оборачиваем каждое сетевое
// действие при определении в slice'е.
export function gate<A extends unknown[], R>(name: string, fn: (...args: A) => R): (...args: A) => R | undefined {
  return (...args: A) => {
    const net = useNet.getState();
    if (net.role === "client") {
      net.client?.send({ type: "action", name, args });
      return undefined;
    }
    return fn(...args);
  };
}
