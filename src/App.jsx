import React, { useState, useRef } from 'react';
import * as cheerio from 'cheerio';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { UploadCloud, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import './App.css';

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findTargetId($, term, idInjections) {
  const termLower = term.toLowerCase().trim();
  if (!termLower) return null;

  const blockTags = ['p', 'div', 'li', 'td', 'dt', 'dd'];
  let targetBlock = null;

  const elements = $(blockTags.join(',')).toArray();
  for (const el of elements) {
    let text = "";
    // We get text directly to avoid picking up text deep in another block if it happens
    $(el).contents().each(function () {
      if (this.type === 'text') text += this.data;
      else if (this.type === 'tag') text += $(this).text();
    });
    text = text.trim();
    const textLower = text.toLowerCase();

    if (textLower.startsWith(termLower)) {
      const regexEnd = new RegExp("^" + escapeRegex(termLower) + "(?![a-z0-9])", "i");
      if (regexEnd.test(text)) {
        targetBlock = el;
        break;
      }
    }
  }

  if (!targetBlock) {
    const allElements = $('body *').toArray();
    for (const el of allElements) {
      const text = $(el).text().trim();
      if (text.toLowerCase().startsWith(termLower)) {
        const regexEnd = new RegExp("^" + escapeRegex(termLower) + "(?![a-z0-9])", "i");
        if (regexEnd.test(text)) {
          targetBlock = el;
          break;
        }
      }
    }
  }

  if (!targetBlock) return null;

  let $el = $(targetBlock);
  let existingId = $el.attr('id') || $el.find('[id]').first().attr('id') || $el.find('[name]').first().attr('name');

  if (existingId) return existingId;

  const newId = "idx-" + termLower.replace(/[^a-z0-9]/g, '');
  let finalId = newId;
  let counter = 1;

  // We check existing IDs on the DOM, AND previously planned injections
  while ($('[id="' + finalId + '"]').length > 0 || idInjections.some(inj => inj.id === finalId)) {
    finalId = newId + '-' + counter;
    counter++;
  }

  idInjections.push({
    startIndex: targetBlock.startIndex,
    id: finalId
  });

  return finalId;
}

function processHtmlContent(htmlString, addLog) {
  const regexHtml = /(<i[^>]*>\s*)?([Ss]ee(?:\s+also)?)(?!\s*also)(\s*<\/i>)?(\s+)((?:[^<>\-;,&]|&(?:[a-zA-Z0-9]+|#[0-9]+|#x[a-fA-F0-9]+);)+)/g;

  const termsToLink = new Set();
  let m;

  // Dry run to collect terms purely from string
  while ((m = regexHtml.exec(htmlString)) !== null) {
    let termUntrimmed = m[5];
    let term = termUntrimmed.trimEnd();
    if (term.toLowerCase() !== "see" && term.toLowerCase() !== "see also") {
      termsToLink.add(term);
    }
  }

  // We use Cheerio ONLY for READ-ONLY lookups of start indices
  const $ = cheerio.load(htmlString, { withStartIndices: true, xmlMode: true, decodeEntities: true });

  const idInjections = [];
  const termToId = {};
  for (const term of termsToLink) {
    const id = findTargetId($, term, idInjections);
    if (id) {
      termToId[term] = id;
      addLog(`Linked: "${term}" -> #${id}`);
    } else {
      addLog(`Warning: Target entry not found for "${term}"`);
    }
  }

  let modifiedHtml = htmlString;

  // Sort descending so backward replacements don't shift forward indices
  idInjections.sort((a, b) => b.startIndex - a.startIndex);

  for (const inj of idInjections) {
    if (inj.startIndex == null) continue;

    const prefix = modifiedHtml.substring(0, inj.startIndex);
    const remaining = modifiedHtml.substring(inj.startIndex);

    // Look for the opening tag match e.g. `<p` or `<div`
    const tagMatch = remaining.match(/^<([a-zA-Z0-9\-:]+)/);
    if (tagMatch) {
      const insertPos = tagMatch[0].length;
      modifiedHtml = prefix + remaining.substring(0, insertPos) + ` id="${inj.id}"` + remaining.substring(insertPos);
    }
  }

  // Final replacement of the Links directly on the string
  modifiedHtml = modifiedHtml.replace(regexHtml, (match, iTagStart, seeText, iTagEnd, spaces, termUntrimmed) => {
    let term = termUntrimmed.trimEnd();
    let trailingSpace = termUntrimmed.substring(term.length);

    let id = termToId[term];
    if (id) {
      return `${iTagStart || ''}${seeText}${iTagEnd || ''}${spaces}<a href="#${id}">${term}</a>${trailingSpace}`;
    } else {
      return match;
    }
  });

  return modifiedHtml;
}


function App() {
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState('idle'); // idle, processing, success, error
  const [errorMsg, setErrorMsg] = useState('');
  const [logs, setLogs] = useState([]);
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

        // Find index file
        for (const [filename, fileObj] of Object.entries(contents.files)) {
          if (!fileObj.dir) {
            const nameLower = filename.toLowerCase();
            if (nameLower.endsWith('index.xhtml') || nameLower.endsWith('index.html') || /index_split_.*\.xhtml$/.test(nameLower)) {
              indexEntryObj = fileObj;
              indexFileName = filename;
              break;
            }
          }
        }

        if (!indexEntryObj) {
          throw new Error('Index file (e.g. index.xhtml) could not be found inside the EPUB.');
        }

        addLog(`Found index file: ${indexFileName}`);
        const htmlContent = await indexEntryObj.async('string');
        const updatedHtml = processHtmlContent(htmlContent, addLog);

        addLog('Repackaging EPUB...');
        zip.file(indexFileName, updatedHtml);

        const blob = await zip.generateAsync({ type: 'blob' });
        saveAs(blob, `Linked_${file.name}`);
        addLog('Download ready!');
        setStatus('success');

      } else if (ext === 'xhtml' || ext === 'html') {
        addLog(`Loading file: ${file.name}`);
        const text = await file.text();
        const updatedHtml = processHtmlContent(text, addLog);

        const blob = new Blob([updatedHtml], { type: 'application/xhtml+xml' });
        saveAs(blob, `Linked_${file.name}`);
        addLog('Download ready!');
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
      <div className="header">
        <h1>IndexLinker</h1>
        <p>Intelligently hyper-link your EPUB index references.</p>
      </div>

      <div
        className={`upload-card ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <UploadCloud className="upload-icon" />
        <div className="upload-title">Select or drag & drop a file</div>
        <div className="upload-desc">Supports .epub & .xhtml files. Automatic processing.</div>

        <input
          type="file"
          ref={fileInputRef}
          className="file-input"
          accept=".epub,.xhtml,.html"
          onChange={handleFileChange}
        />
        <button className="btn-primary" onClick={() => fileInputRef.current.click()}>
          Browse Files
        </button>

        {status !== 'idle' && (
          <div className="status-section">
            <div className="status-flex">
              {status === 'processing' && <Loader2 className="status-icon spin" style={{ color: '#fff' }} />}
              {status === 'success' && <CheckCircle className="status-icon success-text" />}
              {status === 'error' && <AlertCircle className="status-icon error-text" />}

              <div className="status-text">
                {status === 'processing' && 'Processing your file...'}
                {status === 'success' && 'Done! Modifed file downloaded.'}
                {status === 'error' && <span className="error-text">Failed to process</span>}
              </div>
            </div>

            {status === 'error' && <div className="status-sub error-text">{errorMsg}</div>}

            {logs.length > 0 && (
              <div className="log-box">
                {logs.map((log, i) => (
                  <div key={i}>{'>'} {log}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
