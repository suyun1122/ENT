import React, { useEffect, useRef, useState } from "react";

// Agent name constant
const AGENT_NAME = "Dr. Sage";

// Simple markdown to HTML converter
function parseMarkdown(text) {
  if (!text) return "";

  // Split into lines for processing
  const lines = text.split("\n");
  let html = "";
  let inList = false;
  let listItems = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Check if line is a list item
    const isListItem =
      /^[-•*]\s+(.+)$/.test(line) || /^\d+\.\s+(.+)$/.test(line);

    if (isListItem) {
      // Extract list item content
      const match = line.match(/^(?:[-•*]|\d+\.)\s+(.+)$/);
      if (match) {
        listItems.push(match[1]);
        inList = true;
      }
    } else {
      // If we were in a list, close it
      if (inList && listItems.length > 0) {
        html += '<ul class="list-disc list-inside my-2 ml-4 space-y-1">';
        listItems.forEach((item) => {
          // Process inline markdown in list items
          item = item.replace(
            /\*\*(.+?)\*\*/g,
            '<strong class="font-semibold text-gray-900">$1</strong>'
          );
          html += `<li class="text-sm text-gray-700">${item}</li>`;
        });
        html += "</ul>";
        listItems = [];
        inList = false;
      }

      // Process headers
      if (line.startsWith("### ")) {
        html += `<h3 class="text-base font-bold text-gray-900 mt-3 mb-1">${line.substring(
          4
        )}</h3>`;
      } else if (line.startsWith("## ")) {
        html += `<h2 class="text-base font-bold text-gray-900 mt-4 mb-2">${line.substring(
          3
        )}</h2>`;
      } else if (line.startsWith("# ")) {
        html += `<h1 class="text-lg font-bold text-gray-900 mt-4 mb-2">${line.substring(
          2
        )}</h1>`;
      } else if (line.trim() === "") {
        html += '<div class="h-2"></div>';
      } else {
        // Process inline markdown
        line = line.replace(
          /\*\*(.+?)\*\*/g,
          '<strong class="font-semibold text-gray-900">$1</strong>'
        );
        line = line.replace(/\*([^*]+?)\*/g, '<em class="italic">$1</em>');
        html += `<div class="mb-1 text-gray-700">${line}</div>`;
      }
    }
  }

  // Close any remaining list
  if (inList && listItems.length > 0) {
    html += '<ul class="list-disc list-inside my-2 ml-4 space-y-1">';
    listItems.forEach((item) => {
      item = item.replace(
        /\*\*(.+?)\*\*/g,
        '<strong class="font-semibold text-gray-900">$1</strong>'
      );
      html += `<li class="text-sm text-gray-700">${item}</li>`;
    });
    html += "</ul>";
  }

  return html;
}

export default function ClipChat({ videoId }) {
  const [chatHistory, setChatHistory] = useState(() => [
    {
      role: "assistant",
      text: `Hello! I am ${AGENT_NAME}, your AI surgical video analysis assistant. I can help you analyze surgical procedures, identify phases, detect tools, and generate operative reports. How can I assist you today?`,
      date: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recognitionAvailable, setRecognitionAvailable] = useState(false);
  const messagesRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      setRecognitionAvailable(true);
      const r = new SpeechRecognition();
      r.lang = "en-US";
      r.interimResults = false;
      r.maxAlternatives = 1;
      recognitionRef.current = r;
    }
  }, []);

  useEffect(() => {
    // scroll to bottom when chatHistory changes
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [chatHistory, isLoading]);

  function formatDate(ts) {
    const d = new Date(ts);
    return d.toLocaleString();
  }

  async function handleSendText(message) {
    if (!message || message.trim() === "") return;
    const userMsg = { role: "user", text: message.trim(), date: Date.now() };
    setChatHistory((prev) => [...prev, userMsg]);
    setInput("");
    await callAssistant(message.trim());
  }

  async function callAssistant(message) {
    setIsLoading(true);

    // add temporary typing indicator
    const typingId = Date.now();
    setChatHistory((prev) => [
      ...prev,
      {
        role: "assistant",
        text: "",
        date: Date.now(),
        typing: true,
        _id: typingId,
      },
    ]);

    try {
      const prompt = `You are an expert surgical video analysis assistant specializing in endoscopic and minimally invasive procedures.

            Here is the chat history: ${chatHistory
              .map((m) => `${m.role}: ${m.text}`)
              .join("\n")};

            The user asks: ${message};

            Analyze the surgical video and provide detailed, accurate insights about:
            - Surgical phases and steps (preparation, incision, dissection, closure, etc.)
            - Surgical instruments and tools visible (grasper, scissors, hook, bipolar, irrigator, clipper, specimen bag, etc.)
            - Critical events (bleeding, tissue dissection, tool usage, complications)
            - Operative techniques and procedures
            - Recommendations for documentation or training purposes

            Be highly detailed and specific, referencing:
            - Specific timestamps when relevant
            - Surgical instruments and their usage
            - Anatomical structures and surgical steps
            - Any critical events or complications observed
            - Best practices and clinical context

            If the user asks for an operative report, write it in a professional medical format (SOAP format: Subjective, Objective, Assessment, Plan).
            If the user asks about phases, provide clear segmentation with timestamps.
            If the user asks about tools, list all visible instruments with their usage duration and purpose.

            `;

      const resp = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, userQuery: prompt }),
      });

      if (!resp.ok) throw new Error("API request failed");

      const data = await resp.json();

      // flexible parsing
      let assistantText = "";
      if (typeof data === "string") assistantText = data;
      else if (data.response) assistantText = data.response;
      else if (data.data) {
        // sometimes analysis returns nested JSON in data.data
        try {
          const parsed =
            typeof data.data === "string" ? JSON.parse(data.data) : data.data;
          assistantText =
            parsed.response || parsed.reply || JSON.stringify(parsed);
        } catch (e) {
          assistantText = String(data.data);
        }
      } else if (data.message) assistantText = data.message;
      else assistantText = JSON.stringify(data);

      // replace typing indicator
      setChatHistory((prev) => {
        const withoutTyping = prev.filter(
          (m) => !(m.typing && m._id === typingId)
        );
        return [
          ...withoutTyping,
          { role: "assistant", text: assistantText, date: Date.now() },
        ];
      });

      setIsLoading(false);
      return assistantText;
    } catch (error) {
      console.error("Assistant call failed", error);
      setChatHistory((prev) =>
        prev.map((m) =>
          m.typing
            ? {
                role: "assistant",
                text: "I'm sorry — I couldn't process that right now.",
                date: Date.now(),
              }
            : m
        )
      );
      setIsLoading(false);
      return null;
    }
  }

  function startRecording() {
    const r = recognitionRef.current;
    if (!r) return;
    r.onstart = () => setIsRecording(true);
    r.onend = () => setIsRecording(false);
    r.onerror = (e) => {
      console.warn("Speech recognition error", e);
      setIsRecording(false);
    };
    r.onresult = (ev) => {
      const transcript = ev.results[0][0].transcript;
      setInput((prev) => (prev ? prev + " " + transcript : transcript));
    };
    try {
      r.start();
    } catch (e) {
      console.warn("Speech recognition start failed", e);
    }
  }

  function stopRecording() {
    const r = recognitionRef.current;
    if (!r) return;
    try {
      r.stop();
    } catch (e) {
      /* ignore */
    }
    setIsRecording(false);
  }

  return (
    // Constrain height so chat doesn't expand the page; messages area inside is scrollable
    <div
      className="flex flex-col rounded-[20px] outline outline-1 outline-offset-[-1px] outline-gray-300"
      style={{
        height: "56vh",
        overflow: "hidden",
        backgroundColor: "#f4f3f3",
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between bg-white"
        style={{ borderBottom: "1px solid #d9d9d9" }}
      >
        <div className="flex items-center gap-3">
          {/* robot SVG icon - no background */}
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden
            className="text-gray-700 flex-shrink-0"
          >
            <rect
              x="3"
              y="4"
              width="18"
              height="14"
              rx="3"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
            />
            <circle cx="8.5" cy="10" r="1.5" fill="currentColor" />
            <circle cx="15.5" cy="10" r="1.5" fill="currentColor" />
            <rect
              x="9"
              y="13"
              width="6"
              height="1.5"
              rx="0.75"
              fill="currentColor"
              opacity="0.5"
            />
            <rect x="11" y="2" width="2" height="2.5" rx="1" fill="currentColor" opacity="0.5" />
          </svg>

          <div>
            <div className="text-sm font-semibold text-gray-900">
              {AGENT_NAME}
            </div>
            <div className="text-xs text-gray-600">
              Surgical Video Analyst
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesRef} className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        {chatHistory.map((m, i) => (
          <div
            key={i}
            className={`w-full flex ${
              m.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`inline-flex items-end gap-2 ${
                m.role === "user" ? "flex-row-reverse" : ""
              }`}
            >
              <div
                className={`rounded-2xl px-4 py-3 ${
                  m.role === "user"
                    ? "bg-[#1D1C1B] text-white"
                    : "bg-white text-gray-700 outline outline-1 outline-offset-[-1px] outline-gray-300"
                }`}
                style={{ maxWidth: "92%" }}
              >
                <div className={`text-xs mb-1 ${m.role === "user" ? "text-gray-400" : "text-gray-600"}`}>
                  {m.role === "user" ? "You" : AGENT_NAME}
                </div>
                {m.typing ? (
                  <div className="text-sm leading-snug">
                    <TypingDots />
                  </div>
                ) : m.role === "assistant" ? (
                  <div
                    className="text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: parseMarkdown(m.text) }}
                  />
                ) : (
                  <div className="text-sm leading-snug whitespace-pre-wrap">
                    {m.text}
                  </div>
                )}
                <div className={`mt-2 text-[10px] text-right ${m.role === "user" ? "text-gray-400" : "text-gray-400"}`}>
                  {formatDate(m.date)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div
        className="px-4 py-3 bg-white flex items-center gap-3"
        style={{ borderTop: "1px solid #d9d9d9" }}
      >
        <div className="flex-1">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendText(input);
              }
            }}
            placeholder="Ask about surgical phases, tools, or request reports..."
            className="w-full rounded-full px-4 py-2 text-sm focus:outline-none outline outline-1 outline-offset-[-1px] outline-gray-300 bg-gray-50"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (recognitionAvailable) {
                if (isRecording) stopRecording();
                else startRecording();
              }
            }}
            className={`p-2 rounded-full transition-colors ${
              isRecording
                ? "bg-[#1D1C1B] text-white"
                : "bg-white text-gray-700 outline outline-1 outline-offset-[-1px] outline-gray-300 hover:bg-gray-50"
            }`}
            title={
              recognitionAvailable
                ? isRecording
                  ? "Stop recording"
                  : "Start voice input"
                : "Voice not available"
            }
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 2a2 2 0 00-2 2v6a2 2 0 104 0V4a2 2 0 00-2-2zM5 8a5 5 0 0010 0h-1a4 4 0 11-8 0H5z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => handleSendText(input)}
            className="h-10 px-4 py-2 rounded-2xl text-white text-sm bg-[#1D1C1B] hover:bg-gray-800 transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1">
      <span
        className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce"
        style={{ animationDelay: "0s" }}
      />
      <span
        className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce"
        style={{ animationDelay: "0.12s" }}
      />
      <span
        className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce"
        style={{ animationDelay: "0.24s" }}
      />
    </div>
  );
}
