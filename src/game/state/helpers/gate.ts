import { useNet } from "../../../net/netStore";

// Реестр имён action'ов, которые могут уходить от клиента к хосту по сети.
// Заполняется автоматически при определении gate(name, fn) — поэтому когда
// добавляется новый сетевой action, отдельно прописывать его в whitelist
// сетевого слоя НЕ нужно: достаточно обернуть в gate.
//
// Reading: sync.handleIncomingFromClient проверяет это множество, чтобы не
// исполнять чужие/непредусмотренные имена с peer-сторон.
export const networkedActionNames: Set<string> = new Set();

// Сетевой гейт для action'ов. В sp/host выполняем функцию обычным путём; в client
// просто шлём команду хосту и возвращаем undefined (UI пока не дождётся ответа).
// Кроме того, само определение gate(name, fn) регистрирует name как сетевой —
// это снимает необходимость в дублирующем массиве NETWORKED_ACTIONS.
export function gate<A extends unknown[], R>(name: string, fn: (...args: A) => R): (...args: A) => R | undefined {
  networkedActionNames.add(name);
  return (...args: A) => {
    const net = useNet.getState();
    if (net.role === "client") {
      net.client?.send({ type: "action", name, args });
      return undefined;
    }
    return fn(...args);
  };
}
