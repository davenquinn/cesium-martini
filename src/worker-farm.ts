const resolves = {};
const rejects = {};
let globalMsgId = 0; // Activate calculation in the worker, returning a promise

async function sendMessage(worker, payload, transferableObjects) {
  const msgId = globalMsgId++;
  const msg = {
    id: msgId,
    payload,
  };
  return new Promise(function (resolve, reject) {
    // save callbacks for later
    resolves[msgId] = resolve;
    rejects[msgId] = reject;
    worker.postMessage(msg, transferableObjects);
  });
} // Handle incoming calculation result

function handleMessage(msg) {
  const { id, err, payload } = msg.data;
  if (payload) {
    const resolve = resolves[id];
    if (resolve) {
      resolve(payload);
    }
  } else {
    // error condition
    const reject = rejects[id];
    if (reject) {
      if (err) {
        reject(err);
      } else {
        reject("Got nothing");
      }
    }
  }

  // purge used callbacks
  delete resolves[id];
  delete rejects[id];
}

class WorkerFarm {
  worker: Worker;
  constructor() {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = handleMessage;
  }

  async scheduleTask(params, transferableObjects) {
    return await sendMessage(this.worker, params, transferableObjects);
  }
}

export default WorkerFarm;
