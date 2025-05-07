import {GoogleGenAI} from '@google/genai';
import {marked} from 'marked';
import {jsPDF} from 'jspdf';

const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

const userInput = document.querySelector('#input') as HTMLTextAreaElement;
const modelOutput = document.querySelector('#output') as HTMLDivElement;
const slideshow = document.querySelector('#slideshow') as HTMLDivElement;
const error = document.querySelector('#error') as HTMLDivElement;

const additionalInstructions = `
Use a fun story about lots of tiny Dogs as a metaphor.
Keep sentences short but conversational, casual, and engaging.
Generate a cute, minimal illustration for each sentence with colored Dogs on white background.
No commentary, just begin your explanation.
Keep going until you're done.`;

async function addSlide(text: string, image: HTMLImageElement) {
  const slide = document.createElement('div');
  slide.className = 'slide';
  const caption = document.createElement('div') as HTMLDivElement;
  caption.innerHTML = await marked.parse(text);
  slide.append(image);
  slide.append(caption);
  slideshow.append(slide);
}

function parseError(error: string) {
  const regex = /{"error":(.*)}/gm;
  const m = regex.exec(error);
  try {
    const e = m![1];
    const err = JSON.parse(e);
    return err.message;
  } catch (e) {
    return error;
  }
}

async function generate(message: string) {
  console.error('User input:', message);
  userInput.disabled = true;

  // Store the message for later use in PDF
  const originalMessage = message;

  // Create a new chat instance for each generation
  const newChat = ai.chats.create({
    model: 'gemini-2.0-flash-exp',
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
    history: [],
  });

  modelOutput.innerHTML = '';
  slideshow.innerHTML = '';
  error.innerHTML = '';
  error.toggleAttribute('hidden', true);

  try {
    const userTurn = document.createElement('div') as HTMLDivElement;
    userTurn.innerHTML = await marked.parse(message);
    userTurn.className = 'user-turn';
    modelOutput.append(userTurn);
    userInput.value = '';

    const result = await newChat.sendMessageStream({
      message: message + additionalInstructions,
    });

    let text = '';
    let img = null;

    for await (const chunk of result) {
      for (const candidate of chunk.candidates ?? []) {
        for (const part of candidate.content?.parts ?? []) {
          if (part.text) {
            text += part.text;
          } else {
            try {
              const data = part.inlineData;
              if (data) {
                img = document.createElement('img');
                img.src = `data:image/png;base64,` + data.data;
              } else {
                console.error('no data', chunk);
              }
            } catch (e) {
              console.error('no data', chunk);
            }
          }
          if (text && img) {
            await addSlide(text, img);
            slideshow.removeAttribute('hidden');
            text = '';
            img = null;
          }
        }
      }
    }
    if (img) {
      await addSlide(text, img);
      slideshow.removeAttribute('hidden');
      text = '';
    }
    // Show download button after generation is complete
    const downloadButton = document.getElementById('downloadButton');
    if (downloadButton) {
      downloadButton.style.display = 'block';
      // Store the original message as a data attribute
      downloadButton.setAttribute('data-original-message', originalMessage);
    }
  } catch (e) {
    const msg = parseError(e as string);
    error.innerHTML = `Something went wrong: ${msg}`;
    error.removeAttribute('hidden');
  }
  userInput.disabled = false;
  userInput.focus();
}

userInput.addEventListener('keydown', async (e: KeyboardEvent) => {
  if (e.code === 'Enter') {
    e.preventDefault();
    const message = userInput.value;
    await generate(message);
  }
});

const examples = document.querySelectorAll('#examples li');
examples.forEach((li) =>
  li.addEventListener('click', async () => {
    const text = li.textContent;
    if (text) {
      await generate(text);
    }
  }),
);

// Add event listener for download button
const downloadButton = document.getElementById('downloadButton');
if (downloadButton) {
  downloadButton.addEventListener('click', async () => {
    const slides = document.querySelectorAll('.slide');
    
    // Get the original message from the button's data attribute
    const originalMessage = downloadButton.getAttribute('data-original-message') || 'dog_response';
    console.error('Downloading PDF for message:', originalMessage);
    const fileName = originalMessage.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    
    const pdf = new jsPDF();
    
    // Add user's input with better formatting
    pdf.setFontSize(16);
    pdf.setTextColor(44, 62, 80); // Dark blue color for heading
    pdf.text('Your Question:', 10, 20);
    
    pdf.setFontSize(12);
    pdf.setTextColor(52, 73, 94); // Slightly lighter color for the question text
    const splitInput = pdf.splitTextToSize(originalMessage, 180);
    pdf.text(splitInput, 10, 30);
    
    // Add a separator line
    pdf.setDrawColor(200, 200, 200);
    pdf.line(10, 30 + (splitInput.length * 7) + 5, 200, 30 + (splitInput.length * 7) + 5);
    
    // Add model's response
    let yPos = 30 + (splitInput.length * 7) + 15; // Start after the separator
    
    // Add response heading
    pdf.setFontSize(16);
    pdf.setTextColor(44, 62, 80);
    pdf.text('Response:', 10, yPos);
    yPos += 10;
    
    // Reset text color for the rest of the content
    pdf.setTextColor(52, 73, 94);
    pdf.setFontSize(12);
    
    for (const slide of slides) {
      const img = slide.querySelector('img');
      const caption = slide.querySelector('div');
      
      if (img) {
        // Add image
        pdf.addImage(img.src, 'PNG', 10, yPos, 190, 100);
        yPos += 110;
      }
      
      if (caption) {
        // Add caption text
        const captionText = caption.textContent || '';
        const splitCaption = pdf.splitTextToSize(captionText, 180);
        pdf.text(splitCaption, 10, yPos);
        yPos += splitCaption.length * 7 + 10;
      }
      
      // Add new page if we're running out of space
      if (yPos > 250) {
        pdf.addPage();
        yPos = 20;
      }
    }
    
    pdf.save(`${fileName}.pdf`);
  });
}

