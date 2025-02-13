const resolves = {};
const rejects = {};
let globalMsgId = 0; // Activate calculation in the worker, returning a promise

async function sendMessage(
  worker: Worker,
  payload: any,
  transferableObjects: Transferable[],
) {
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
  inProgressWorkers: number = 0;
  maxWorkers: number = 5;
  processingQueue: Function[] = [];

  constructor(opts) {
    this.worker = opts.worker;
    this.worker.onmessage = handleMessage;
  }

  async scheduleTask(params, transferableObjects) {
    const res = await sendMessage(this.worker, params, transferableObjects);
    this.releaseWorker();
    return res;
  }

  async holdForAvailableWorker(): Promise<void> {
    let resultPromise: Promise<void>;
    if (this.inProgressWorkers > this.maxWorkers) {
      resultPromise = new Promise((resolve, reject) => {
        this.processingQueue.push(resolve);
      });
    } else {
      resultPromise = Promise.resolve(null);
    }
    await resultPromise;
    this.inProgressWorkers += 1;
  }

  releaseWorker() {
    this.inProgressWorkers -= 1;
    if (this.processingQueue.length > 0) {
      this.processingQueue.shift()();
    }
  }
}

export default WorkerFarm;
