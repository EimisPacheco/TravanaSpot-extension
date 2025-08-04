  # TravanaSpot-extension

  ## What it does

  TravanaSpot is a Chrome extension that enhances the Airbnb browsing experience by providing
  AI-powered review analysis through a friendly assistant called "Little Airby". When users visit an
   Airbnb listing page, the extension automatically extracts listing data and up to 100 guest
  reviews, then uses Google's Gemini AI to generate comprehensive insights, sentiment analysis, and
  answers to specific questions about the property.

  ##Key Features

  1. Automatic Review Collection - Extracts up to 100 reviews from any Airbnb listing page
  2. AI-Powered Analysis - Uses Gemini AI to analyze reviews and generate:
    - Trust score (0-100)
    - Sentiment analysis with percentages (positive/neutral/negative)
    - Top highlights with actual guest quotes
    - Pros and cons lists
    - Guest insights (recommended for/not recommended for)
    - Best features and areas for improvement
  3. Interactive Q&A - Chat with Little Airby to ask specific questions about:
    - Local restaurants and dining options
    - Activities and attractions in the area
    - Property-specific details from reviews
    - Any other questions about the listing
  4. Email Reports - Send beautifully formatted analysis reports via email with all insights, charts, and review summaries
  5. Side Panel Interface - Clean, modern UI that opens in Chrome's side panel for easy access while
   browsing

<img width="803" height="884" alt="image" src="https://github.com/user-attachments/assets/a55b9356-30af-4320-961e-74fc1e6b3069" />
<img width="733" height="836" alt="image" src="https://github.com/user-attachments/assets/c3c71286-3918-4e4c-8a90-48e3493e82e0" />
<img width="738" height="867" alt="image" src="https://github.com/user-attachments/assets/d2203ce9-c9c1-4c66-8934-c2c23fabaa3b" />



   ## How you built it

  The extension is built using:

  - Chrome Extension Manifest V3 - Modern extension architecture with service workers
  - Content Script (content-script.js) - Injects into Airbnb pages to extract listing data and
  reviews
  - Service Worker (service-worker.js) - Handles background tasks and manages extension lifecycle
  - Side Panel API - Provides dedicated UI space without blocking the main content
  - Gemini AI Integration (gemini-ai-integration.js) - Custom class that:
    - Handles API authentication
    - Manages context windows for large review sets
    - Uses structured output for analysis (JSON schema)
    - Switches to plain text for Q&A responses
    - Implements chunking for processing 100+ reviews
  - Technologies: Vanilla JavaScript, HTML5, CSS3, Fetch API

   ## How are you using Resend

  Resend is integrated for email functionality through the email-sender.js module:

  1. API Integration - Direct API calls to Resend's endpoint (https://api.resend.com/emails)
  2. HTML Email Generation - Creates rich HTML emails using email-template-exact.js that matches the
   side panel design
  3. Email Features:
    - Sends comprehensive analysis reports
    - Includes all AI insights (trust score, sentiment, pros/cons)
    - Formats review highlights with visual progress bars
    - Maintains the purple gradient branding
  4. User Flow:
    - User clicks "📧 Email Analysis" button
    - Enters email address in the input field
    - Extension sends formatted HTML email via Resend API
    - User receives professional analysis report in their inbox

  The Resend integration allows users to save and share property analyses, making it perfect for trip planning with friends or keeping records of potential bookings.
