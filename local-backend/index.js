// This script runs on your local machine, not in the cloud.
// It connects to your Firebase project, listens for new activity,
// and adds blocks to your blockchain.

console.log("Starting local blockchain server...");

// Import the necessary libraries
const admin = require("firebase-admin");
const crypto = require("crypto-js");

// --- IMPORTANT ---
// This line loads your private key file.
// Make sure 'serviceAccountKey.json' is in the same folder as this script.
const serviceAccount = require("./serviceAccountKey.json");

// Initialize the Firebase Admin SDK with your key
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Get a reference to the Firestore database
const db = admin.firestore();

console.log("Successfully connected to Firebase project.");

// --- Blockchain Logic (same as before) ---

async function createNewBlock(newActivityData) {
  console.log("New activity detected, creating a new block...");
  const blockchainRef = db.collection("blockchain");

  try {
    const lastBlockQuery = await blockchainRef
      .orderBy("timestamp", "desc")
      .limit(1)
      .get();

    let previousHash = "0"; // For the Genesis Block

    if (!lastBlockQuery.empty) {
      const lastBlock = lastBlockQuery.docs[0].data();
      previousHash = lastBlock.hash;
      console.log(`Last block found. Previous hash: ${previousHash.substring(0, 10)}...`);
    } else {
      console.log("This is the first block in the chain (Genesis Block).");
    }

    const newBlock = {
      timestamp: Date.now(),
      activity: newActivityData,
      previousHash: previousHash,
    };

    const blockHash = crypto.SHA256(JSON.stringify(newBlock)).toString();
    newBlock.hash = blockHash;
    console.log(`New block created with hash: ${blockHash.substring(0, 10)}...`);

    await blockchainRef.add(newBlock);
    console.log("✅ New block successfully added to the blockchain.");

  } catch (error) {
    console.error("❌ Error creating new block:", error);
  }
}

// --- Real-time Listener ---
// This is the part that "watches" your database for changes.

function watchActivityLog() {
  const query = db.collection("activityLogs");

  console.log("Watching for new activities in the database...");

  // onSnapshot is a real-time listener.
  // It runs every time a document is added to the activityLogs collection.
  query.onSnapshot(querySnapshot => {
    querySnapshot.docChanges().forEach(change => {
      // We only care about new documents being added.
      if (change.type === 'added') {
        const newActivity = change.doc.data();
        // When a new activity appears, run our blockchain logic.
        createNewBlock(newActivity);
      }
    });
  }, err => {
    console.log(`Encountered error: ${err}`);
  });
}

// --- NEW UTILITY FUNCTION TO CLEAR COLLECTIONS ---
async function clearCollection(collectionPath) {
    const collectionRef = db.collection(collectionPath);
    const snapshot = await collectionRef.limit(500).get(); // Get documents in batches of 500

    if (snapshot.empty) {
        console.log(`Collection '${collectionPath}' is already empty.`);
        return;
    }

    // Delete documents in a batch
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
    });

    await batch.commit();

    console.log(`Successfully cleared ${snapshot.size} documents from '${collectionPath}'.`);

    // Recurse on the same function to delete more documents if they exist
    if (snapshot.size === 500) {
        await clearCollection(collectionPath);
    }
}


// --- Main Script Execution (UPDATED) ---

// Check if the script was run with the '--clear' argument
if (process.argv.includes('--clear')) {
  console.log("Clear command received. Deleting blockchain and activity logs...");
  // Use a Promise.all to run both clearing operations concurrently
  Promise.all([
    clearCollection('blockchain'),
    clearCollection('activityLogs')
  ]).then(() => {
    console.log("Clearing process complete.");
    process.exit(0); // Exit the script after clearing is done
  }).catch(error => {
    console.error("An error occurred during clearing:", error);
    process.exit(1); // Exit with an error code
  });
} else {
  // If no '--clear' argument, start the server normally
  watchActivityLog();
}

