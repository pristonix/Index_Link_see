import React, { useState, useRef, useEffect } from 'react';
import * as cheerio from 'cheerio';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { UploadCloud, CheckCircle, AlertCircle, Loader2, Sparkles, FileStack } from 'lucide-react';
import './App.css';

/* -------------------------
   Core Engine Logic 
-------------------------- */

function normalizeTerm(term) {
    return term
        .toLowerCase()
        .replace(/\(.*/, "")
        .replace(/[–—]/g, "-")
        .replace(/-/g, " ")
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function extractTermParts($li) {
    const children = $li.contents().toArray();
    const termNodes = [];
    const restNodes = [];
    let separatorFound = false;

    children.forEach(node => {
        if (separatorFound) {
            restNodes.push(node);
            return;
        }

        if (node.type === "text") {
            const text = node.data;
            const match = text.match(/([,:;(])/);

            if (match) {
                const idx = text.indexOf(match[1]);
                const termText = text.slice(0, idx);
                const restText = text.slice(idx);

                if (termText.trim()) {
                    termNodes.push({ type: "text", data: termText });
                }

                restNodes.push({ type: "text", data: restText });
                separatorFound = true;
            } else {
                // Split at period if it's near the end of the text node (right before <i>See</i> usually)
                const matchPeriod = text.match(/(\.)\s*$/);
                if (matchPeriod) {
                    const idx = text.lastIndexOf(matchPeriod[1]);
                    const termText = text.slice(0, idx);
                    const restText = text.slice(idx);

                    if (termText.trim()) {
                        termNodes.push({ type: "text", data: termText });
                    }

                    restNodes.push({ type: "text", data: restText });
                    separatorFound = true;
                } else {
                    termNodes.push(node);
                }
            }
        } else if (node.type === "tag" && (node.name === "i" || node.name === "em")) {
            const tagText = cheerio.load(node).text().trim().toLowerCase();
            if (tagText.startsWith("see")) {
                separatorFound = true;
                restNodes.push(node);
            } else {
                termNodes.push(node);
            }
        } else if (node.type === "tag" && (node.name === "ol" || node.name === "ul" || node.name === "dl")) {
            separatorFound = true;
            restNodes.push(node);
        } else {
            termNodes.push(node);
        }
    });

    return { termNodes, restNodes };
}

function convertIndexEntries($) {
    let counter = 1;

    $("li").each(function () {
        const $li = $(this);

        if ($li.attr("epub:type") === "index-entry") return;

        const text = $li.text().trim().toLowerCase();

        if (
            text.startsWith("see ") ||
            text.startsWith("see also") ||
            text.startsWith("see under")
        ) return;

        if (!$li.attr("id")) {
            $li.attr("id", "idx" + counter);
            counter++;
        }

        $li.attr("epub:type", "index-entry");

        const { termNodes, restNodes } = extractTermParts($li);

        if (!termNodes.length) return;

        const span = $('<span epub:type="index-term"></span>');
        termNodes.forEach(node => span.append(node));

        $li.empty();
        $li.append(span);
        restNodes.forEach(node => $li.append(node));
    });
}

function buildIndexMap($) {
    const map = {};

    $('[epub\\:type="index-entry"]').each(function () {
        const $li = $(this);
        const term = $li
            .find('[epub\\:type="index-term"]')
            .text()
            .trim();

        const id = $li.attr("id");

        if (!term || !id) return;

        const normalized = normalizeTerm(term);
        map[normalized] = id;
    });

    return map;
}

function linkCrossReferences($, termMap, addLog) {
    $("li").each(function () {
        const $li = $(this);
        const html = $li.html();

        if (!html) return;

        const regex = /(<i[^>]*>\s*)(See(?:\s+also|\s+under)?)(\s*<\/i>)(\s+)([^<]+)/i;
        const match = html.match(regex);

        if (!match) return;

        let phrase = match[5].trim();

        const mainTerm = phrase
            .replace(/\(.*/, "")
            .replace(/,.*/, "")
            .trim();

        // DECODE html entities before normalizing! This matches mapping precisely!
        const decodedMainTerm = cheerio.load(mainTerm).text();
        const normalized = normalizeTerm(decodedMainTerm);
        const id = termMap[normalized];

        if (!id) {
            addLog(`Warning: Valid target for "${decodedMainTerm}" not found.`);
            return;
        }

        addLog(`Linked: "${decodedMainTerm}" -> #${id}`);
        const link = `<a href="#${id}">${mainTerm}</a>`;
        const rest = phrase.substring(mainTerm.length);
        const newHtml = `${match[1]}${match[2]}${match[3]} ${link}${rest}`;

        $li.html(html.replace(regex, newHtml));
    });
}

function processHtmlContent(htmlString, addLog) {
    const $ = cheerio.load(htmlString, {
        xmlMode: true,
        decodeEntities: true
    });

    convertIndexEntries($);
    const termMap = buildIndexMap($);
    linkCrossReferences($, termMap, addLog);

    return $.xml();
}

/* -------------------------
   Application Component
-------------------------- */

function App() {
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState('idle'); // idle, processing, success, error
  const [errorMsg, setErrorMsg] = useState('');
  const [logs, setLogs] = useState([]);
  const [zipInstance, setZipInstance] = useState(null);
  const [availableFiles, setAvailableFiles] = useState([]);
  const [showFileSelector, setShowFileSelector] = useState(false);
  const [currentFileObj, setCurrentFileObj] = useState(null);
  const fileInputRef = useRef(null);

  const addLog = (msg) => setLogs(prev => [...prev, msg]);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const processFile = async (file) => {
    setStatus('processing');
    setLogs([]);
    setErrorMsg('');

    try {
      const ext = file.name.split('.').pop().toLowerCase();

      if (ext === 'epub') {
        const zip = new JSZip();
        addLog(`Loading EPUB archive: ${file.name}`);
        const contents = await zip.loadAsync(file);

        let indexEntryObj = null;
        let indexFileName = '';
        const possibleFiles = [];

        for (const [filename, fileObj] of Object.entries(contents.files)) {
          if (!fileObj.dir) {
            const nameLower = filename.toLowerCase();
            if (nameLower.endsWith('.xhtml') || nameLower.endsWith('.html')) {
              possibleFiles.push(filename);
            }
            if (nameLower.endsWith('index.xhtml') || nameLower.endsWith('index.html') || /index_split_.*\.xhtml$/.test(nameLower)) {
              if (!indexEntryObj) {
                indexEntryObj = fileObj;
                indexFileName = filename;
              }
            }
          }
        }

        if (!indexEntryObj) {
          addLog('Index file not found automatically. Please select from the list.');
          setZipInstance(zip);
          setCurrentFileObj(file);
          setAvailableFiles(possibleFiles);
          setShowFileSelector(true);
          setStatus('idle');
          return;
        }

        await continueProcessingZip(zip, file, indexFileName);

      } else if (ext === 'xhtml' || ext === 'html') {
        addLog(`Loading file: ${file.name}`);
        const text = await file.text();
        const updatedHtml = processHtmlContent(text, addLog);

        const blob = new Blob([updatedHtml], { type: 'application/xhtml+xml' });
        saveAs(blob, `Linked_${file.name}`);
        addLog('Processing complete! File generated.');
        setStatus('success');
      } else {
        throw new Error('Unsupported format. Please upload an .epub or .xhtml file.');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message);
      setStatus('error');
    }
  };

  const continueProcessingZip = async (zip, originalFile, indexFileName) => {
    try {
      setStatus('processing');
      setShowFileSelector(false);
      addLog(`Selected index file: ${indexFileName}`);
      const indexEntryObj = zip.file(indexFileName);
      const htmlContent = await indexEntryObj.async('string');
      const updatedHtml = processHtmlContent(htmlContent, addLog);

      addLog('Repackaging EPUB...');
      zip.file(indexFileName, updatedHtml);

      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, `Linked_${originalFile.name}`);
      addLog('Processing complete. Clean, rich EPUB downloaded!');
      setStatus('success');
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message);
      setStatus('error');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length) {
      processFile(files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files.length) {
      processFile(e.target.files[0]);
    }
  };

  return (
    <div className="app-container">
      <div className="header-blob blob-1"></div>
      <div className="header-blob blob-2"></div>
      <div className="glass-panel">
        <div className="header">
            <div className="logo-container">
                <Sparkles className="logo-icon" />
            </div>
            <h1>Index Linker</h1>
            <p>Smart hyper-linking for your EPUB index references.</p>
        </div>

        <div
            className={`upload-zone ${isDragging ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <div className="upload-border"></div>
            <div className="upload-content">
                <div className="icon-wrapper">
                    <CloudIcon isDragging={isDragging} />
                </div>
                <h3>Drag & Drop your file</h3>
                <p>Supports .epub & .xhtml formats</p>
                <input
                    type="file"
                    ref={fileInputRef}
                    className="file-hidden"
                    accept=".epub,.xhtml,.html"
                    onChange={handleFileChange}
                />
                <button className="btn-glow" onClick={() => fileInputRef.current.click()}>
                    Browse Files
                </button>
            </div>
        </div>

        {showFileSelector && (
          <div className="file-selector-panel animate-fade-in">
            <div className="panel-title">
                <FileStack size={18} />
                <span>Select Target Index</span>
            </div>
            <select
              id="indexFileSelect"
              className="modern-select"
            >
              {availableFiles.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <button
              className="btn-glow full-width"
              onClick={() => {
                const sel = document.getElementById('indexFileSelect').value;
                continueProcessingZip(zipInstance, currentFileObj, sel);
              }}
            >
              Start Process
            </button>
          </div>
        )}

        {status !== 'idle' && (
          <div className={`status-panel ${status === 'error' ? 'error' : ''} animate-slide-up`}>
              <div className="status-header">
                {status === 'processing' && <Loader2 className="status-badge pulse spin" />}
                {status === 'success' && <CheckCircle className="status-badge success" />}
                {status === 'error' && <AlertCircle className="status-badge error" />}
                <div className="status-message">
                  {status === 'processing' && 'Analyzing index patterns...'}
                  {status === 'success' && 'Done! Modified file is ready.'}
                  {status === 'error' && 'Failed to process file'}
                </div>
              </div>
              
              {status === 'error' && <div className="error-details">{errorMsg}</div>}
              
              {logs.length > 0 && (
                <div className="terminal-container">
                    <div className="terminal-header">
                        <span className="dot dot-red"></span>
                        <span className="dot dot-yellow"></span>
                        <span className="dot dot-green"></span>
                    </div>
                    <div className="terminal-body" id="log-view">
                        {logs.map((log, i) => (
                            <div key={i} className="log-line">
                                <span className="log-arrow">{'>'}</span> {log}
                            </div>
                        ))}
                    </div>
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  );
}

function CloudIcon({ isDragging }) {
    return (
        <svg 
            width="64" height="64" viewBox="0 0 24 24" fill="none" 
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" 
            className={`upload-svg ${isDragging ? 'bounce' : 'float'}`}
        >
            <path d="M17.5 19C19.9853 19 22 16.9853 22 14.5C22 12.0147 19.9853 10 17.5 10C17.2001 10 16.9071 10.0294 16.626 10.0857C15.8239 6.58156 12.6394 4 8.75 4C4.47029 4 1 7.47029 1 11.75C1 14.7679 2.72314 17.3828 5.2443 18.6659" />
            <path d="M12 11V21M12 11L8 15M12 11L16 15" />
        </svg>
    );
}

export default App;
