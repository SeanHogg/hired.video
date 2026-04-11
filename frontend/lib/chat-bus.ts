/**
 * chat-bus — minimal pub/sub used by the CommunicationHub to ask the
 * globally-mounted ChatPanel to open a conversation mini-window. Avoids
 * threading a React context through the Navigation tree just to plumb a
 * single imperative call.
 */

type OpenListener = (conversationId: string) => void;

const listeners = new Set<OpenListener>();

export const chatBus = {
  open(conversationId: string) {
    for (const fn of listeners) fn(conversationId);
  },
  subscribe(fn: OpenListener) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
