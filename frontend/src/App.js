import React, { useState, useEffect, useRef } from "react";
import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail,
  deleteUser,
} from "firebase/auth";
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import { Widget } from "@uploadcare/react-widget";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  ShieldCheck,
  Activity,
  UploadCloud,
  File as FileIcon,
  LogOut,
  Loader,
  MessageSquare,
  Bot,
  X,
  Blocks,
  Link as LinkIcon,
  Clipboard,
  Settings,
  CheckCircle,
  AlertTriangle,
  Share2,
  UserPlus,
  Trash2,
  Folder,
  FileText,
  ImageIcon,
} from "lucide-react";

import "./App.css";

// --- Reusable UI Components (No Changes) ---

const Card = ({ children, className }) => (
  <motion.div
    initial={{ y: 30, opacity: 0 }}
    animate={{ y: 0, opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ type: "spring", stiffness: 70, damping: 15 }}
    className={`glass-card ${className || ""}`}
  >
    {children}
  </motion.div>
);

const Button = ({ children, disabled, onClick, className }) => (
  <button
    disabled={disabled}
    onClick={onClick}
    className={`neon-button ${disabled ? "disabled" : ""} ${className || ""}`}
  >
    {children}
  </button>
);

const Input = React.forwardRef(({ type, value, onChange, placeholder, disabled, onKeyPress }, ref) => (
  <input
    ref={ref}
    type={type}
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    disabled={disabled}
    className="glass-input"
    autoComplete="off"
    spellCheck="false"
    onKeyPress={onKeyPress}
  />
));

const AvatarBadge = ({ email }) => {
  const initials = email ? email.split(/[@.]/)[0].slice(0, 2).toUpperCase() : "";
  return <div className="avatar-badge">{initials}</div>;
};

const Alert = ({ text }) => (
  <div className="alert alert-danger" role="alert">
    {text}
  </div>
);

// --- Main App Component (No Changes) ---

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="loading-screen">
        <Loader className="loader-icon" />
        <p>Initializing Secure Session...</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <AnimatePresence mode="wait">
        {user ? (
          <motion.div key="dashboard" className="page-wrapper">
            <Dashboard user={user} />
          </motion.div>
        ) : (
          <motion.div key="login" className="page-wrapper">
            <LoginPage />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Login Page Component (No Changes) ---

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      if (isRegister) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(err.message.replace("Firebase: ", "").replace(/\./g, ""));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="login-page">
      <Card className="login-card">
        <div className="login-header">
          <ShieldCheck className="icon icon-large" />
          <h2>SecureChain</h2>
          <p>Modern Cloud Storage</p>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          <Input
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
            autoFocus
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={pending}
          />
          <Button disabled={pending} type="submit">
            {pending ? <Loader className="loader-icon small" /> : isRegister ? "Create Account" : "Login"}
          </Button>
        </form>
        <div className="login-footer">
          {isRegister ? "Already have an account?" : "Don't have an account?"}
          <button
            type="button"
            onClick={() => { if (!pending) setIsRegister((v) => !v); setError(""); }}
            className="toggle-registrar"
            disabled={pending}
          >
            {isRegister ? "Login here" : "Register now"}
          </button>
        </div>
        {error && <Alert text={error} />}
      </Card>
      <footer className="footer">Built with React & Firebase © {new Date().getFullYear()}</footer>
    </main>
  );
}

// --- Dashboard Component (MODIFIED to manage shared state) ---

function Dashboard({ user }) {
  const [activities, setActivities] = useState([]);
  const [blockchain, setBlockchain] = useState([]);
  const [successMsg, setSuccessMsg] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChainViewerOpen, setIsChainViewerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  // --- STATE LIFTED UP ---
  // The 'files' state now lives here, in the parent component.
  const [files, setFiles] = useState([]);

  useEffect(() => {
    // This listener gets all activities (uploads and deletes)
    const qActivities = query(collection(db, "activityLogs"), orderBy("timestamp", "asc"));
    const unsubActivities = onSnapshot(qActivities, (snapshot) => {
      const allActivities = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setActivities(allActivities);
      
      // --- NEW LOGIC: Derive the current file list from the activity log ---
      const fileMap = new Map();
      allActivities.forEach(log => {
        if (log.action.startsWith("UPLOAD_FILE")) {
          // Add or update the file in the map
          fileMap.set(log.fileName, {
            id: log.id,
            name: log.fileName,
            type: getFileType(log.fileName), // Helper function to determine file type
            timestamp: log.timestamp // <-- ADD THIS LINE

          });
        } else if (log.action === "DELETE_FILE") {
          // Remove the file from the map
          fileMap.delete(log.fileName);
        }
      });
      setFiles(Array.from(fileMap.values()));
    });

    const qBlockchain = query(collection(db, "blockchain"), orderBy("timestamp", "asc"));
    const unsubBlockchain = onSnapshot(qBlockchain, (snapshot) => {
      setBlockchain(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubActivities();
      unsubBlockchain();
    };
  }, []);

  // Helper function to guess file type from name
  const getFileType = (fileName) => {
    const extension = fileName.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif'].includes(extension)) return 'image';
    if (['pdf', 'doc', 'docx', 'txt'].includes(extension)) return 'doc';
    return 'generic';
  };

  // --- LOGIC LIFTED UP ---
  // The handleDelete function now lives here and is passed down as a prop.
  const handleDelete = async (fileToDelete, confirm = true) => {
    const shouldDelete = confirm ? window.confirm(`Are you sure you want to delete "${fileToDelete.name}"? This action will be logged.`) : true;
    
    if (shouldDelete) {
      try {
        await addDoc(collection(db, "activityLogs"), {
          userId: user.uid,
          userEmail: user.email,
          action: "DELETE_FILE",
          fileName: fileToDelete.name,
          timestamp: new Date(),
        });
        // The file list will update automatically via the onSnapshot listener
        alert(`Deletion of "${fileToDelete.name}" was successfully logged to the blockchain.`);
      } catch (err) {
        alert("Error logging deletion: " + err.message);
      }
    }
  };


  const handleUpload = async (fileInfo) => {
    if (!fileInfo || !fileInfo.cdnUrl) return;
    try {
      await addDoc(collection(db, "activityLogs"), {
        userId: user.uid,
        userEmail: user.email,
        action: "UPLOAD_FILE_UPLOADCARE",
        fileName: fileInfo.name,
        fileURL: fileInfo.cdnUrl,
        timestamp: new Date(),
      });
      setSuccessMsg(`File "${fileInfo.name}" uploaded and logged successfully!`);
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err) {
      alert("Error logging metadata: " + err.message);
    }
  };

  const handlePasswordReset = () => {
    if (!user?.email) return;
    sendPasswordResetEmail(auth, user.email)
      .then(() => alert("Password reset email sent!"))
      .catch((error) => alert("Failed to send reset email: " + error.message));
  };

  const handleAccountDelete = async () => {
    if (!window.confirm("Are you sure you want to delete your account? This is irreversible.")) return;
    try {
      await deleteUser(user);
      alert("Account deleted successfully.");
    } catch (error) {
      if (error.code === "auth/requires-recent-login") {
        alert("Recent login required. Please log out and log back in before deleting your account.");
      } else {
        alert("Error deleting account: " + error.message);
      }
    }
  };

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div className="dashboard-title"><ShieldCheck className="icon icon-medium" /><h1>SecureChain</h1></div>
        <div className="user-info">
          <button className="settings-btn neon-button" title="Settings" style={{ padding: "8px", minWidth: "unset" }} onClick={() => setSettingsOpen(true)}><Settings /></button>
          <AvatarBadge email={user.email || ""} />
          <p className="user-email">{user.email}</p>
          <button className="logout-btn neon-button" onClick={() => signOut(auth)} title="Logout"><LogOut className="icon icon-small" />Logout</button>
        </div>
      </header>
      
      <SettingsMenu open={settingsOpen} onClose={() => setSettingsOpen(false)} user={user} onPasswordReset={handlePasswordReset} onDelete={handleAccountDelete} />
      
      <section className="dashboard-content">
        <Card className="upload-section">
          <h2 className="section-title"><UploadCloud className="icon icon-small" />Upload File</h2>
          <div className="upload-area">
            <label htmlFor="file-upload" className="uploadcare-label">
              <Widget
                publicKey="e5b0d841d64d38a2b0ed"
                id="file-upload"
                multiple={false}
                onChange={handleUpload}
                clearable
              />
            </label>
            <p className="upload-note">Files are uploaded to a secure, free cloud service.</p>
            {successMsg && <div className="upload-success">{successMsg}</div>}
          </div>
        </Card>
        
        <FileBrowser 
          user={user} 
          files={files} 
          handleDelete={handleDelete} 
        />
        
        <Card className="activity-feed">
          <div className="activity-feed-header">
            <h2 className="section-title"><Activity className="icon icon-small" />Real-Time Activity Feed</h2>
            <Button onClick={() => setIsChainViewerOpen(true)} className="view-chain-btn"><Blocks className="icon icon-small" />View Blockchain</Button>
          </div>
          // Inside the Dashboard component, in the "activity-feed" Card

<div className="activities-list">
  {activities.length === 0 ? ( 
    <p className="no-activities">No activities yet. Upload a file to get started!</p> 
  ) : (
    // Using [...activities].reverse() to show newest logs first
    [...activities].reverse().map(({ id, userEmail, fileName, action, timestamp }) => (
      <div key={id} className="activity-item">
        <div className="activity-icon">
          {/* --- NEW: Conditional Icon --- */}
          {action === "DELETE_FILE" ? 
            <Trash2 className="icon icon-small icon-delete" /> : 
            <FileIcon className="icon icon-small icon-upload" />
          }
        </div>
        <div className="activity-content">
          <p>
            <strong>{userEmail}</strong>
            {/* --- NEW: Conditional Text --- */}
            {action === 'DELETE_FILE' ? ' deleted ' : ' uploaded '}
            <code>{fileName}</code>
          </p>
          <p className="activity-time">{timestamp ? new Date(timestamp.seconds * 1000).toLocaleString() : ""}</p>
        </div>
      </div>
    ))
  )}
</div>
        </Card>
      </section>
      
      <Chatbot 
        isChatOpen={isChatOpen} 
        setIsChatOpen={setIsChatOpen} 
        files={files} 
        handleDelete={handleDelete} 
          activities={activities} // <-- ADD THIS PROP

      />
      <BlockchainViewer isOpen={isChainViewerOpen} setIsOpen={setIsChainViewerOpen} chain={blockchain} />
      
      <footer className="footer">Built with React & Firebase © {new Date().getFullYear()}</footer>
    </main>
  );
}

// --- FileBrowser Component (MODIFIED to be a 'dumb' component) ---

function FileBrowser({ user, files, handleDelete }) { // Now receives props
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [fileToShare, setFileToShare] = useState(null);
  
  const onShare = (file) => {
    setFileToShare(file);
    setShareModalOpen(true);
  };
  
  const getFileIcon = (type) => {
    switch(type) {
      case 'folder': return <Folder className="file-icon folder" />;
      case 'image': return <ImageIcon className="file-icon image" />;
      case 'doc': return <FileText className="file-icon doc" />;
      default: return <FileIcon className="file-icon" />;
    }
  };

  return (
    <>
      <Card className="my-files-section">
        <h2 className="section-title">My Files</h2>
        <div className="file-list">
          {files.length === 0 ? <p>No files uploaded yet.</p> : files.map((file) => (
            <div className="file-item" key={file.id}>
              <div className="file-name">
                {getFileIcon(file.type)}
                {file.name}
              </div>
              <div className="file-actions">
                <button onClick={() => onShare(file)} title="Share file"><Share2 size={16} /></button>
                <button onClick={() => handleDelete(file)} title="Delete file" className="delete-btn"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        fileName={fileToShare?.name}
      />
    </>
  );
}

// --- ShareModal Component (No Changes) ---

function ShareModal({ isOpen, onClose, fileName }) {
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState("view");
  const [sent, setSent] = useState(false);

  const handleSendInvite = () => {
    setSent(true);
    setTimeout(() => {
      setSent(false);
      setEmail("");
      onClose();
    }, 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div className="modal-content share-file-modal" initial={{ y: -50, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 50, opacity: 0, scale: 0.95 }} transition={{ type: "spring", stiffness: 100, damping: 20 }} onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <div className="modal-title"><UserPlus className="icon icon-small" /> Share File</div>
              <button onClick={onClose} className="close-modal-btn"><X className="icon icon-small" /></button>
            </header>
            <div className="modal-body">
              <p>Sharing <strong>{fileName}</strong></p>
              <Input type="email" placeholder="example@domain.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <select value={permission} onChange={(e) => setPermission(e.target.value)} className="glass-input"><option value="view">Can View</option><option value="edit">Can Edit</option></select>
              {sent && <p className="invite-sent-msg">Invite sent successfully!</p>}
            </div>
            <footer className="modal-footer">
              <Button onClick={handleSendInvite} disabled={!email}>Send Invite</Button>
              <Button onClick={onClose} className="btn-secondary">Cancel</Button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// --- Chatbot Component (UPGRADED with Function Calling) ---

// In the Chatbot component...

function Chatbot({ isChatOpen, setIsChatOpen, files, handleDelete, activities }) {

  // 1. State and Ref definitions are correctly placed at the top.
  const [messages, setMessages] = useState([
    { from: "bot", text: "Hello! I am your AI assistant. I can now list recent files or delete them for you. How can I help?" }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  
  // Make sure to replace this with your actual, new API key
  const API_KEY = "AIzaSyDSpjyoRTf3H9KptzlAtsn9yXtkFkHwTIA"; 

  // 2. AI Tools definition
  const tools = [
    {
      functionDeclarations: [
        {
          name: "getRecentActivity",
          description: "Get a log of the 5 most recent activities, including file uploads and deletions.",
          parameters: { type: "OBJECT", properties: {} },
        },
        {
          name: "deleteFile",
          description: "Delete a specific file by its name.",
          parameters: {
            type: "OBJECT",
            properties: {
              fileName: { type: "STRING", description: "The name of the file to delete, e.g., 'report.pdf'." },
            },
            required: ["fileName"],
          },
        },
      ],
    },
  ];

  // 3. AI Model Initialization
  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", tools: tools });

  // 4. Helper function for sending messages
  // Paste this entire function into your Chatbot component

const handleSendMessage = async () => {
    if (input.trim() === "" || isLoading) return;

    const userMessage = { from: "user", text: input };
    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input;
    setInput("");
    setIsLoading(true);

    try {
      // --- THE FIX IS HERE ---
      // First, we define the instructions that give the AI its persona.
      const systemContext = `
        You are an expert AI assistant for an application called "SecureChain".
        Your tone should be helpful and professional.
        SecureChain is a secure cloud storage web app built as a final year project. Its key features are:
        1. Real-time monitoring of all user actions.
        2. A tamper-proof audit trail using a simulated blockchain.
        3. If the user asks how to upload a file, instruct them to click the 'Upload File' button on the dashboard. You cannot perform the upload yourself.
      `;

      // Now, we start the chat and pass those instructions as the initial history.
      const chat = model.startChat({
        history: [{ role: "user", parts: [{ text: systemContext }] }],
      });
      // --- END OF FIX ---

      const result = await chat.sendMessage(currentInput);
      const response = await result.response;
      const functionCalls = response.functionCalls();

      if (functionCalls && functionCalls.length > 0) {
        let functionResponse;
        const calls = functionCalls.map(async (call) => {
          const { name, args } = call;
          let apiResponse;

          if (name === "getRecentActivity") {
            const recentActivities = [...activities]
              .reverse()
              .slice(0, 5)
              .map(act => `${act.action === 'DELETE_FILE' ? 'Deleted' : 'Uploaded'} '${act.fileName}'`)
              .join('\n - ');
            
            apiResponse = { result: `Here are the 5 most recent activities:\n - ${recentActivities || 'No activity found.'}` };
          } else if (name === "deleteFile") {
            const fileToDelete = files.find(f => f.name === args.fileName);
            if (fileToDelete) {
              await handleDelete(fileToDelete, false);
              apiResponse = { result: `Successfully deleted the file: ${args.fileName}` };
            } else {
              apiResponse = { result: `Could not find a file named: ${args.fileName}` };
            }
          }
          return { functionResponse: { name, response: apiResponse } };
        });

        functionResponse = await Promise.all(calls);
        const secondResult = await chat.sendMessage(functionResponse);
        const finalResponse = secondResult.response.text();
        const botMessage = { from: "bot", text: finalResponse };
        setMessages((prev) => [...prev, botMessage]);

      } else {
        const text = response.text();
        const botMessage = { from: "bot", text: text };
        setMessages((prev) => [...prev, botMessage]);
      }
    } catch (error) {
      console.error("Error with Function Calling:", error);
      const errorMessage = { from: "bot", text: "Sorry, an error occurred with my tools. Please check the console." };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };
  // 5. useEffect hook for scrolling
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 6. The return statement with all the JSX
  return (
    <>
      <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setIsChatOpen(true)} className="chatbot-fab" aria-label="Open chatbot">
        <MessageSquare />
      </motion.button>
      <AnimatePresence>
        {isChatOpen && (
          <motion.div initial={{ opacity: 0, y: 50, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 50, scale: 0.9 }} transition={{ type: 'spring', stiffness: 100, damping: 20 }} className="chatbot-window">
            <header className="chatbot-header">
              <div className="chatbot-title"><Bot className="icon icon-small" /><span>AI Assistant</span></div>
              <button onClick={() => setIsChatOpen(false)} className="close-chat-btn"><X className="icon icon-small" /></button>
            </header>
            <div className="chatbot-messages">
              {messages.map((msg, index) => (
                <motion.div key={index} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }} className={`chat-message ${msg.from}`}>{msg.text}</motion.div>
              ))}
              {isLoading && <div className="chat-message bot loading-dots"><span>.</span><span>.</span><span>.</span></div>}
              <div ref={messagesEndRef} />
            </div>
            <footer className="chatbot-footer">
              <Input
                type="text"
                placeholder="Ask a question..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                disabled={isLoading}
              />
              <Button onClick={handleSendMessage} disabled={isLoading || !input.trim()}>
                {isLoading ? <Loader className="loader-icon small"/> : 'Send'}
              </Button>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

} // <-- The single, final closing brace for the entire component.

// --- BlockchainViewer Component (No Changes) ---

function BlockchainViewer({ isOpen, setIsOpen, chain }) {
  const [copiedHash, setCopiedHash] = useState(null);
  const handleCopy = (hash) => { navigator.clipboard.writeText(hash); setCopiedHash(hash); setTimeout(() => setCopiedHash(null), 2000); };
  const genesisBlock = { hash: "0000000000000000000000000000000000000000000000000000000000000000", previousHash: "0", timestamp: new Date(0).getTime(), activity: { action: "GENESIS_BLOCK", userEmail: "System", fileName: "The first block in the chain." } };
  const displayChain = chain.length > 0 ? chain : [genesisBlock];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop" onClick={() => setIsOpen(false)}>
          <motion.div initial={{ y: -50, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 50, opacity: 0, scale: 0.95 }} transition={{ type: "spring", stiffness: 100, damping: 20 }} className="modal-content" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h2 className="section-title"><Blocks className="icon icon-medium" />Blockchain Ledger</h2>
              <button onClick={() => setIsOpen(false)} className="close-modal-btn"><X className="icon icon-small" /></button>
            </header>
            <div className="blockchain-viewer">
              {displayChain.map((block, index) => (
                <React.Fragment key={block.id || index}>
                  <motion.div className="blockchain-block-visual" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }}>
                    <div className="block-visual-header">
                      <h3>Block #{index}</h3><span className="block-visual-timestamp">{new Date(block.timestamp.seconds * 1000).toLocaleString()}</span>
                    </div>
                    <div className="block-visual-body">
                      <p><strong>User:</strong> {block.activity.userEmail}</p>
                      <p><strong>Action:</strong> {block.activity.action}</p>
                      <p><strong>File:</strong> <code>{block.activity.fileName}</code></p>
                    </div>
                    <div className="block-visual-footer">
                      <div className="hash-container">
                        <p className="hash-label">Hash</p>
                        <div className="hash-value-wrapper">
                          <p className="hash-value">{block.hash.substring(0, 24)}...</p>
                          <button onClick={() => handleCopy(block.hash)} className="copy-btn">{copiedHash === block.hash ? <ShieldCheck className="icon-copy" /> : <Clipboard className="icon-copy" />}</button>
                        </div>
                      </div>
                      <div className="hash-container">
                        <p className="hash-label">Previous Hash</p>
                        <div className="hash-value-wrapper">
                          <p className="hash-value">{block.previousHash.substring(0, 24)}...</p>
                          <button onClick={() => handleCopy(block.previousHash)} className="copy-btn">{copiedHash === block.previousHash ? <ShieldCheck className="icon-copy" /> : <Clipboard className="icon-copy" />}</button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                  {index < displayChain.length - 1 && (<motion.div className="chain-link-visual" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.1 + 0.1 }}><LinkIcon /></motion.div>)}
                </React.Fragment>
              ))}
              {displayChain.length === 1 && chain.length === 0 && (<p className="no-blocks-message">The Genesis Block is the foundation. Upload a file to add the next block to the chain!</p>)}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// --- SettingsMenu Component (No Changes) ---

function SettingsMenu({ open, onClose, user, onPasswordReset, onDelete }) {
  const created = user?.metadata?.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString() : "";
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div className="modal-content" initial={{ y: -50, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 50, opacity: 0, scale: 0.95 }} transition={{ type: "spring", stiffness: 100, damping: 20 }} onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h2 className="section-title"><Settings className="icon icon-medium" />Settings</h2>
              <button onClick={onClose} className="close-modal-btn"><X className="icon icon-small" /></button>
            </header>
            <div className="settings-menu-body">
              <SecurityHealth />
              <section className="settings-section">
                <h4>Account Information</h4>
                <p><strong>Email:</strong> {user.email}</p>
                <p><strong>UID:</strong> <code>{user.uid}</code></p>
                <p><strong>Created:</strong> {created}</p>
              </section>
              <section className="settings-section">
                <h4>Security</h4>
                <Button onClick={onPasswordReset}>Send Password Reset</Button>
                <Button onClick={onDelete} className="btn-danger">Delete Account</Button>
              </section>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// --- SecurityHealth Component (No Changes) ---

function SecurityHealth() {
  const securityItems = [
    { text: "Strong Password", status: true },
    { text: "Two-Factor Authentication", status: false },
    { text: "Last Password Change: 3 days ago", status: true },
  ];
  const score = securityItems.filter(item => item.status).length;
  const total = securityItems.length;

  return (
    <section className="settings-section security-health">
      <h4>Account Security Health</h4>
      <div className="security-health-score">
        <p>Your score is <strong>{score} of {total}</strong>.</p>
        <div className="score-bar"><motion.div className="score-bar-inner" initial={{ width: 0 }} animate={{ width: `${(score/total) * 100}%`}} transition={{ duration: 0.8, ease: "easeOut" }} /></div>
      </div>
      <ul className="security-checklist">
        {securityItems.map((item, index) => (
          <motion.li key={index} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + index * 0.1 }}>
            {item.status ? <CheckCircle className="icon-check" /> : <AlertTriangle className="icon-alert" />}
            <span>{item.text}</span>
            {!item.status && <Button className="btn-action enable-btn">Enable</Button>}
          </motion.li>
        ))}
      </ul>
    </section>
  );
}