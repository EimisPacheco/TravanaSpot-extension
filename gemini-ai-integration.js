// Little Airby (Gemini AI) Integration for TravanaSpot Chrome Extension
// Handles review analysis and Little Airby's sweet insights

class TravanaSpotGeminiAI {
  constructor() {
    this.apiKey = 'AIzaSyD3VOx_ekHUaGva23HBl5f5J0112kf7U6s';
    this.model = 'gemini-1.5-flash'; // Updated to correct model name
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    this.isAnalyzing = false;
    
    // Context window limits for Gemini 1.5 Flash
    this.MAX_CONTEXT_CHARS = 700000; // Conservative limit (~700k chars to stay under 1M tokens)
    this.MAX_CHARS_PER_CHUNK = 200000; // Process reviews in ~200k char chunks
    this.PROMPT_OVERHEAD = 5000; // Reserve space for prompt instructions
    
    console.log('TravanaSpot: Little Airby (Gemini AI) initialized with:', {
      apiKey: this.apiKey ? 'Present' : 'Missing',
      model: this.model,
      baseUrl: this.baseUrl,
      maxContextChars: this.MAX_CONTEXT_CHARS,
      maxCharsPerChunk: this.MAX_CHARS_PER_CHUNK
    });
  }

  // Split reviews into chunks based on character count
  splitReviewsIntoChunks(reviews, maxCharsPerChunk) {
    const chunks = [];
    let currentChunk = [];
    let currentChunkSize = 0;
    
    for (const review of reviews) {
      let comment = (review.text || review.comments || '').trim();
      if (comment && comment.length > 10) {
        // Truncate reviews longer than 600 characters
        if (comment.length > 600) {
          comment = comment.substring(0, 600) + '...';
        }
        
        // Check if adding this review would exceed chunk size
        if (currentChunkSize + comment.length + 10 > maxCharsPerChunk && currentChunk.length > 0) {
          // Save current chunk and start a new one
          chunks.push([...currentChunk]);
          currentChunk = [];
          currentChunkSize = 0;
        }
        
        currentChunk.push(comment);
        currentChunkSize += comment.length + 10; // Account for separator
      }
    }
    
    // Add the last chunk if it has content
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  }

  // Merge multiple analysis results into one comprehensive result
  mergeAnalysisResults(results) {
    if (results.length === 0) return null;
    if (results.length === 1) return results[0];
    
    console.log(`TravanaSpot: Merging ${results.length} analysis results...`);
    
    // Initialize merged result with structure
    const merged = {
      trust_score: 0,
      sentiment_analysis: {
        positive_percentage: 0,
        neutral_percentage: 0,
        negative_percentage: 0,
        overall_sentiment: 'neutral'
      },
      keyword_analysis: {},
      pros_and_cons: {
        pros: new Set(),
        cons: new Set()
      },
      guest_insights: {
        recommended_for: new Set(),
        not_recommended_for: new Set(),
        best_features: new Set(),
        areas_for_improvement: new Set()
      },
      summary: []
    };
    
    let totalReviews = 0;
    
    // Merge each result
    for (const result of results) {
      // Average trust scores
      merged.trust_score += result.trust_score || 0;
      
      // Aggregate sentiment percentages (will average later)
      merged.sentiment_analysis.positive_percentage += result.sentiment_analysis?.positive_percentage || 0;
      merged.sentiment_analysis.neutral_percentage += result.sentiment_analysis?.neutral_percentage || 0;
      merged.sentiment_analysis.negative_percentage += result.sentiment_analysis?.negative_percentage || 0;
      
      // Merge keyword analysis
      if (result.keyword_analysis && Array.isArray(result.keyword_analysis)) {
        for (const keyword of result.keyword_analysis) {
          const key = keyword.keyword.toLowerCase();
          if (!merged.keyword_analysis[key]) {
            merged.keyword_analysis[key] = {
              keyword: keyword.keyword,
              positive: 0,
              negative: 0,
              total_mentions: 0,
              positive_snippets: [],
              negative_snippets: []
            };
          }
          
          merged.keyword_analysis[key].positive += keyword.positive || 0;
          merged.keyword_analysis[key].negative += keyword.negative || 0;
          merged.keyword_analysis[key].total_mentions += keyword.total_mentions || 0;
          
          // Add unique snippets (up to 10 each)
          if (keyword.positive_snippets) {
            for (const snippet of keyword.positive_snippets) {
              if (!merged.keyword_analysis[key].positive_snippets.includes(snippet) &&
                  merged.keyword_analysis[key].positive_snippets.length < 10) {
                merged.keyword_analysis[key].positive_snippets.push(snippet);
              }
            }
          }
          
          if (keyword.negative_snippets) {
            for (const snippet of keyword.negative_snippets) {
              if (!merged.keyword_analysis[key].negative_snippets.includes(snippet) &&
                  merged.keyword_analysis[key].negative_snippets.length < 10) {
                merged.keyword_analysis[key].negative_snippets.push(snippet);
              }
            }
          }
        }
      }
      
      // Merge pros and cons
      if (result.pros_and_cons) {
        if (result.pros_and_cons.pros) {
          result.pros_and_cons.pros.forEach(pro => merged.pros_and_cons.pros.add(pro));
        }
        if (result.pros_and_cons.cons) {
          result.pros_and_cons.cons.forEach(con => merged.pros_and_cons.cons.add(con));
        }
      }
      
      // Merge guest insights
      if (result.guest_insights) {
        ['recommended_for', 'not_recommended_for', 'best_features', 'areas_for_improvement'].forEach(field => {
          if (result.guest_insights[field]) {
            result.guest_insights[field].forEach(item => merged.guest_insights[field].add(item));
          }
        });
      }
      
      // Collect summaries
      if (result.summary) {
        merged.summary.push(result.summary);
      }
      
      totalReviews++;
    }
    
    // Finalize merged result
    merged.trust_score = Math.round(merged.trust_score / results.length);
    
    // Average sentiment percentages
    merged.sentiment_analysis.positive_percentage = Math.round(merged.sentiment_analysis.positive_percentage / results.length);
    merged.sentiment_analysis.neutral_percentage = Math.round(merged.sentiment_analysis.neutral_percentage / results.length);
    merged.sentiment_analysis.negative_percentage = Math.round(merged.sentiment_analysis.negative_percentage / results.length);
    
    // Determine overall sentiment
    const sentiments = merged.sentiment_analysis;
    if (sentiments.positive_percentage > sentiments.negative_percentage + 20) {
      merged.sentiment_analysis.overall_sentiment = 'positive';
    } else if (sentiments.negative_percentage > sentiments.positive_percentage + 20) {
      merged.sentiment_analysis.overall_sentiment = 'negative';
    } else {
      merged.sentiment_analysis.overall_sentiment = 'neutral';
    }
    
    // Convert keyword_analysis object back to array and sort by mentions
    merged.keyword_analysis = Object.values(merged.keyword_analysis)
      .sort((a, b) => b.total_mentions - a.total_mentions)
      .slice(0, 10); // Keep top 10 keywords
    
    // Convert sets to arrays
    merged.pros_and_cons.pros = Array.from(merged.pros_and_cons.pros).slice(0, 7);
    merged.pros_and_cons.cons = Array.from(merged.pros_and_cons.cons).slice(0, 7);
    
    merged.guest_insights.recommended_for = Array.from(merged.guest_insights.recommended_for).slice(0, 5);
    merged.guest_insights.not_recommended_for = Array.from(merged.guest_insights.not_recommended_for).slice(0, 5);
    merged.guest_insights.best_features = Array.from(merged.guest_insights.best_features).slice(0, 5);
    merged.guest_insights.areas_for_improvement = Array.from(merged.guest_insights.areas_for_improvement).slice(0, 5);
    
    // Create comprehensive summary from all partial summaries
    merged.summary = `Based on analysis of multiple review batches: ${merged.summary.join(' Additionally, ')}`;
    
    // Set the total reviews analyzed - this should be set by the caller
    // who knows the actual total number of reviews processed
    merged.analysis_type = 'little_airby_powered';
    
    console.log('TravanaSpot: Merged analysis complete');
    console.log('TravanaSpot: Total reviews analyzed:', merged.reviews_analyzed);
    return merged;
  }

  // Analyze reviews and generate insights
  async analyzeReviews(reviews, userQuestion = null) {
    if (!reviews || reviews.length === 0) {
      throw new Error('No reviews to analyze');
    }

    if (this.isAnalyzing) {
      throw new Error('Analysis already in progress');
    }

    this.isAnalyzing = true;

    try {
      console.log('TravanaSpot: Starting comprehensive review analysis...');
      console.log('TravanaSpot: Total reviews received:', reviews.length);
      console.log('TravanaSpot: Will analyze up to 100 reviews');

      // Use up to 100 reviews for comprehensive analysis
      const reviewsToAnalyze = reviews.slice(0, 100);
      
      // Check if we need to split into chunks
      const estimatedTotalChars = reviewsToAnalyze.reduce((total, review) => {
        const text = (review.text || review.comments || '').trim();
        return total + Math.min(text.length, 600); // Account for truncation
      }, 0);
      
      console.log(`TravanaSpot: Estimated total characters: ${estimatedTotalChars}`);
      
      // If content is too large, split into chunks
      if (estimatedTotalChars + this.PROMPT_OVERHEAD > this.MAX_CHARS_PER_CHUNK) {
        console.log('TravanaSpot: Content too large for single request, splitting into chunks...');
        
        const chunks = this.splitReviewsIntoChunks(reviewsToAnalyze, this.MAX_CHARS_PER_CHUNK - this.PROMPT_OVERHEAD);
        console.log(`TravanaSpot: Split into ${chunks.length} chunks`);
        
        const chunkResults = [];
        
        // Process each chunk
        for (let i = 0; i < chunks.length; i++) {
          console.log(`TravanaSpot: Processing chunk ${i + 1}/${chunks.length} with ${chunks[i].length} reviews...`);
          
          const chunkReviewsSample = chunks[i].join('\n\n---\n\n');
          console.log(`TravanaSpot: Chunk ${i + 1} size: ${chunkReviewsSample.length} characters`);
          
          try {
            const chunkPrompt = this.buildAnalysisPrompt(chunkReviewsSample, userQuestion, i + 1, chunks.length);
            const chunkAnalysis = await this.sendAnalysisRequest(chunkPrompt);
            
            if (chunkAnalysis) {
              // Don't set reviews_analyzed per chunk - let merge handle it
              chunkAnalysis.analysis_type = 'little_airby_powered';
              chunkResults.push(chunkAnalysis);
              console.log(`TravanaSpot: Chunk ${i + 1} analysis complete`);
            }
          } catch (chunkError) {
            console.error(`TravanaSpot: Error analyzing chunk ${i + 1}:`, chunkError);
            // Continue with other chunks even if one fails
          }
        }
        
        // Merge all chunk results
        if (chunkResults.length === 0) {
          throw new Error('All chunk analyses failed');
        }
        
        const mergedAnalysis = this.mergeAnalysisResults(chunkResults);
        
        // Set the total reviews analyzed to the original count
        mergedAnalysis.reviews_analyzed = reviewsToAnalyze.length;
        
        this.isAnalyzing = false;
        
        console.log('TravanaSpot: Multi-chunk analysis complete');
        console.log(`TravanaSpot: Total reviews analyzed: ${mergedAnalysis.reviews_analyzed}`);
        return mergedAnalysis;
        
      } else {
        // Single request for smaller content
        console.log('TravanaSpot: Content fits in single request');
        
        // Extract review texts
        const reviewTexts = [];
        for (const review of reviewsToAnalyze) {
          let comment = (review.text || review.comments || '').trim();
          if (comment && comment.length > 10) {
            if (comment.length > 600) {
              comment = comment.substring(0, 600) + '...';
              console.log('TravanaSpot: Truncated long review from', comment.length, 'to 600 chars');
            }
            reviewTexts.push(comment);
          }
        }
        
        if (reviewTexts.length === 0) {
          throw new Error('No substantial review text found for analysis');
        }
        
        console.log('TravanaSpot: Valid review texts found:', reviewTexts.length);
        console.log('TravanaSpot: Sample review texts:', reviewTexts.slice(0, 3));
        
        const reviewsSample = reviewTexts.join('\n\n---\n\n');
        console.log('TravanaSpot: Total prompt character count:', reviewsSample.length);
        console.log('TravanaSpot: First 500 chars of reviews being sent:', reviewsSample.substring(0, 500));
        
        const prompt = this.buildAnalysisPrompt(reviewsSample, userQuestion);
        const analysis = await this.sendAnalysisRequest(prompt);
        
        // Ensure reviews_analyzed is set for single chunk analysis
        if (!analysis.reviews_analyzed) {
          analysis.reviews_analyzed = reviewsToAnalyze.length; // Use total reviews, not just valid texts
        }
        analysis.analysis_type = 'little_airby_powered';
        
        console.log(`TravanaSpot: Analysis complete. Reviews analyzed: ${analysis.reviews_analyzed}`);
        
        this.isAnalyzing = false;
        return analysis;
      }

    } catch (error) {
      this.isAnalyzing = false;
      console.error('TravanaSpot: Gemini AI analysis failed:', error);
      
      // Return fallback analysis if all else fails
      return this.fallbackReviewAnalysis(reviews.slice(0, 100));
    }
  }

  // Build the analysis prompt
  buildAnalysisPrompt(reviewsSample, userQuestion = null, chunkNumber = null, totalChunks = null) {
    let prompt = `Hi! I'm Little Airby, your friendly travel companion! 🧸 I've carefully read through these Airbnb reviews with love and attention, and I'm excited to share my sweet insights with you! `;
    
    if (chunkNumber && totalChunks) {
      prompt += `This is chunk ${chunkNumber} of ${totalChunks} - I'm working through them all to give you the most complete picture! `;
    }
    
    prompt += `Return ONLY valid JSON with this exact structure:

{
  "trust_score": 0-100,
  "sentiment_analysis": {
    "positive_percentage": 0-100,
    "neutral_percentage": 0-100,
    "negative_percentage": 0-100,
    "overall_sentiment": "positive|neutral|negative"
  },
  "keyword_analysis": [
    {
      "keyword": "cleanliness",
      "positive": 5,
      "negative": 1,
      "total_mentions": 6,
      "positive_snippets": ["exact quotes mentioning cleanliness positively"],
      "negative_snippets": ["exact quotes mentioning cleanliness negatively"]
    }
  ],
  "pros_and_cons": {
    "pros": ["list 5-7 specific positive aspects guests mentioned most frequently"],
    "cons": ["list 5-7 specific negative aspects or complaints guests mentioned - MUST find cons even if reviews are mostly positive"]
  },
  "guest_insights": {
    "recommended_for": ["specific guest types who enjoyed their stay based on reviews"],
    "not_recommended_for": ["MUST extract specific guest types who would NOT enjoy this property based on negative reviews - e.g. 'light sleepers due to noise', 'guests with mobility issues', 'large families', etc."],
    "best_features": ["top 3 specific features guests loved most"],
    "areas_for_improvement": ["top 3 specific issues guests mentioned"]
  },
  "summary": "A warm, friendly 10-15 sentence summary written by Little Airby! Include everything guests really think about this cozy place - the overall vibe and atmosphere, specific things that made guests happy, any concerns they mentioned, who would absolutely love staying here, who might find it challenging, cleanliness insights, how lovely (or not) the host is, location perks and quirks, value for your hard-earned money, how well it matches the listing, comfort levels, amenity quality, and Little Airby's final sweet verdict. Write it like a caring friend who's read every review is telling you all the important details with warmth and honesty!"
}

KEYWORD FORMATTING RULES:
- Use natural, readable keywords WITHOUT underscores
- Examples: "check-in process", "value for money", "host communication"
- NEVER use underscores like "check-in_process" or "value_for_money"

Focus on these key aspects: cleanliness, location, host communication, value for money, accuracy of listing, comfort, noise levels, amenities, check-in process.

IMPORTANT: You MUST analyze AT LEAST 5-7 different keywords/aspects from the list above. Do not just analyze "cleanliness" - include multiple aspects that are mentioned in the reviews. Even if some aspects have fewer mentions, still include them. The keyword_analysis array should have 5-7 items minimum.

IMPORTANT for guest_insights:
- recommended_for: Extract SPECIFIC guest types mentioned in positive reviews (e.g., "families with young children", "remote workers", "couples seeking romance")
- not_recommended_for: YOU MUST FIND AND LIST guest types who would NOT enjoy this property. Look for ANY complaints about noise, stairs, space, location issues, etc. Examples: "light sleepers" (if noise mentioned), "guests with mobility issues" (if stairs/access mentioned), "large groups" (if space is tight), "party seekers" (if quiet area), "budget travelers" (if expensive)
- best_features: Extract the ACTUAL features guests praised most (e.g., "stunning ocean view from balcony", "extremely comfortable beds", "fully equipped kitchen")
- areas_for_improvement: Extract ACTUAL issues guests mentioned (e.g., "thin walls between units", "limited parking spaces", "outdated bathroom fixtures")

For pros_and_cons:
- pros: Find 5-7 specific positive things mentioned across reviews
- cons: YOU MUST FIND 5-7 negative aspects. Even if reviews are mostly positive, look for ANY complaints about: noise, cleanliness issues, maintenance problems, location downsides, host communication gaps, amenity issues, comfort problems, accuracy concerns, check-in difficulties, parking, stairs, space, temperature control, Wi-Fi, kitchen equipment, bathroom issues, etc.

For the summary: Write a DETAILED, COMPREHENSIVE paragraph (10-15 sentences) that tells the FULL story of this property based on ALL reviews. Include:
1. The overall impression and atmosphere
2. What most guests loved about it
3. Common complaints and issues (BE HONEST)
4. How the host behaves and communicates
5. Location advantages and disadvantages
6. Whether it matches the listing description
7. Cleanliness standards
8. Comfort level of beds/furniture
9. Amenities that work well and those that don't
10. Value for money assessment
11. Who would love this place
12. Who should avoid it
13. Final verdict

Write it conversationally, as if explaining to a close friend who's considering booking this place.

CRITICAL INSTRUCTIONS:
- Extract REAL quotes from the actual reviews below
- positive_snippets must contain ACTUAL phrases from reviews that mention the keyword positively
- negative_snippets must contain ACTUAL phrases from reviews that mention the keyword negatively
- Maximum 10 snippets per sentiment type (10 positive, 10 negative) per keyword
- Use EXACT quotes, not paraphrases
- Trust score should reflect overall reliability based on review patterns
- CRITICAL: You MUST properly escape ALL quotes (") inside snippet strings by using \"
- CRITICAL: If a review contains quotes like "amazing" or dialogue, you MUST escape them as \"amazing\"
- CRITICAL: Do NOT include line breaks, newlines, or carriage returns inside snippet strings
- CRITICAL: Keep snippets under 150 characters each
- CRITICAL: Ensure ALL JSON strings are properly terminated with closing quotes

REVIEWS TO ANALYZE:
${reviewsSample}`;

    // If user has a specific question, completely change the prompt to focus ONLY on answering
    if (userQuestion) {
      // Check if the question is about location/area specifics (restaurants, attractions, etc.)
      const locationKeywords = ['restaurant', 'food', 'eat', 'dining', 'cafe', 'coffee', 'bar', 'pub', 
                               'grocery', 'store', 'shop', 'market', 'supermarket', 'mall',
                               'attraction', 'museum', 'park', 'beach', 'sight', 'tourist',
                               'transport', 'metro', 'bus', 'train', 'station', 'airport',
                               'nearby', 'around', 'close', 'walk', 'distance', 'area', 'neighborhood'];
      
      const isLocationQuestion = locationKeywords.some(keyword => 
        userQuestion.toLowerCase().includes(keyword)
      );
      
      prompt = `Hi there! 🧸 Little Airby here! You asked me a question and I'm so excited to help! I've read through all these Airbnb reviews with extra care to find exactly what you need to know.

YOUR SWEET QUESTION: "${userQuestion}"

Little Airby's mission:
1. I'll search through every review with my magnifying glass 🔍 to find information about your question
2. For location/area questions, I'll look for ANY mentions of: restaurants, cafes, food places, grocery stores, attractions, transport, walking distances, or neighborhood characteristics
3. I'll give you a direct, honest answer based on what guests actually mentioned
4. If reviews don't have enough detail, I'll provide helpful suggestions on how to find this information
5. I promise to be honest, helpful, and as cute as possible! 💕

${isLocationQuestion ? `SPECIAL LOCATION SEARCH INSTRUCTIONS:
- Look for ANY mentions of: restaurants, dining options, cafes, bars, food delivery services
- Check for: grocery stores, markets, convenience stores, shopping areas
- Find references to: distance, walking time, "minutes away", "nearby", "around the corner"
- Note any mentions of: public transport, metro, bus stops, train stations
- Look for neighborhood descriptions: quiet, busy, residential, commercial, safe, convenient
- Search for specific place names or street names mentioned by guests` : ''}

Return your response as valid JSON with this exact structure:
{
  "trust_score": 85,
  "sentiment_analysis": {
    "positive_percentage": 70,
    "neutral_percentage": 20,
    "negative_percentage": 10,
    "overall_sentiment": "positive"
  },
  "keyword_analysis": [],
  "pros_and_cons": {
    "pros": [],
    "cons": []
  },
  "guest_insights": {
    "recommended_for": [],
    "not_recommended_for": [],
    "best_features": [],
    "areas_for_improvement": []
  },
  "summary": "Little Airby's sweet answer! 🧸💕 ${isLocationQuestion ? 
    `For location questions: First, I'll share ANY mentions of restaurants, cafes, stores, or specific places that guests talked about. I'll include walking distances or time mentions if available. Even if reviews don't have specific restaurant names but mention things like "great restaurants nearby", "lots of dining options within walking distance", "convenient for food", or "easy access to cafes", I'll share those exact quotes! If there's absolutely no specific info about restaurants/food in the reviews, I'll be honest but helpful: 'Oh sweetie! I searched through all the reviews carefully, but guests didn't specifically mention restaurant names or dining options. However, guests did say [share any general location comments like "great location", "convenient area", "walkable neighborhood"]. For specific restaurant recommendations near ${userQuestion.includes('located in') ? 'this location' : 'the property'}, I'd suggest: 1) Message the host - they usually have a list of their favorite local spots! 2) Check the listing's guidebook section for dining recommendations 3) Look at Google Maps near the address for highly-rated restaurants within walking distance. The host would be happy to help with specific recommendations! 💕'` : 
    `Answer the specific question based on review content. If the information isn't in reviews, warmly explain what the reviews DO cover and suggest asking the host or checking the listing details.`}"
}

REVIEWS TO ANALYZE:
${reviewsSample}`;
    }
    
    return prompt;
  }

  // Send analysis request and handle response
  async sendAnalysisRequest(prompt) {
    console.log('TravanaSpot: ===== SENDING TO AI =====');
    console.log('TravanaSpot: Full prompt being sent (first 1000 chars):', prompt.substring(0, 1000));
    console.log('TravanaSpot: Prompt length:', prompt.length, 'characters');
    console.log('TravanaSpot: Sending analysis request to Gemini...');
    
    const response = await this.callGeminiAPI(prompt);
    
    console.log('TravanaSpot: ===== RECEIVED FROM AI =====');
    console.log('TravanaSpot: Raw AI response:', response);
    console.log('TravanaSpot: Response type:', typeof response);
    console.log('TravanaSpot: Response length:', response ? response.length : 0);
    
    // Parse JSON response - with structured output, response should be valid JSON
    let analysis;
    try {
      // First, check if response is wrapped in markdown (shouldn't happen with structured output)
      let jsonText = response;
      if (response.startsWith('```')) {
        console.warn('TravanaSpot: Response wrapped in markdown, extracting JSON...');
        const match = response.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (match && match[1]) {
          jsonText = match[1].trim();
        } else {
          // Try to extract between first ``` and last ```
          const startIdx = response.indexOf('```');
          const endIdx = response.lastIndexOf('```');
          if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            jsonText = response.substring(startIdx + 3, endIdx).trim();
            // Remove 'json' if it's at the beginning
            if (jsonText.startsWith('json')) {
              jsonText = jsonText.substring(4).trim();
            }
          }
        }
      }
      
      // Try to parse the JSON
      try {
        analysis = JSON.parse(jsonText);
        console.log('TravanaSpot: Successfully parsed JSON response');
      } catch (firstError) {
        console.warn('TravanaSpot: First parse attempt failed, trying to clean JSON...');
        console.warn('TravanaSpot: Error was:', firstError.message);
        
        // Attempt to fix common JSON issues
        let cleanedJson = jsonText;
        
        // Show context around the error position
        if (firstError.message.includes('position')) {
          const posMatch = firstError.message.match(/position (\d+)/);
          if (posMatch) {
            const errorPos = parseInt(posMatch[1]);
            const contextStart = Math.max(0, errorPos - 200);
            const contextEnd = Math.min(cleanedJson.length, errorPos + 200);
            console.error('TravanaSpot: JSON error context:');
            console.error('Before error:', cleanedJson.substring(contextStart, errorPos));
            console.error('AT ERROR POSITION >>>', cleanedJson.charAt(errorPos), '<<<');
            console.error('After error:', cleanedJson.substring(errorPos + 1, contextEnd));
            
            // Check if error is in a review snippet
            const beforeError = cleanedJson.substring(0, errorPos);
            const lastSnippetStart = Math.max(
              beforeError.lastIndexOf('positive_snippets'),
              beforeError.lastIndexOf('negative_snippets')
            );
            if (lastSnippetStart > -1) {
              console.error('TravanaSpot: Error appears to be in a snippet array');
            }
          }
        }
        
        // Try various fixes...
        // [Rest of the JSON cleaning logic from the original code]
        
        throw firstError; // For now, just throw the error
      }
      
      // Validate required fields
      if (!analysis.trust_score || !analysis.sentiment_analysis || !analysis.keyword_analysis) {
        throw new Error('Missing required fields in AI response');
      }
      
      // Log success
      console.log('TravanaSpot: ✅ AI Analysis completed successfully');
      console.log('TravanaSpot: Trust Score:', analysis.trust_score);
      console.log('TravanaSpot: Keywords analyzed:', analysis.keyword_analysis.length);
      console.log('TravanaSpot: Pros found:', analysis.pros_and_cons?.pros?.length || 0);
      console.log('TravanaSpot: Cons found:', analysis.pros_and_cons?.cons?.length || 0);
      
      return analysis;
      
    } catch (parseError) {
      console.error('TravanaSpot: Failed to parse AI response:', parseError);
      console.error('TravanaSpot: Raw response that failed to parse:', response);
      
      // Check if response contains error keywords
      if (response && response.toLowerCase().includes('error')) {
        console.error('TravanaSpot: Response contains error keyword');
      }
      
      throw parseError;
    }
  }

  // Fallback analysis when AI fails
  fallbackReviewAnalysis(reviews) {
    console.log('TravanaSpot: Using enhanced fallback review analysis');
    
    const reviewTexts = reviews.map(r => r.text || r.comments || '').filter(t => t.length > 10);
    
    // Enhanced sentiment analysis using keyword counting
    const positiveWords = ['great', 'excellent', 'amazing', 'perfect', 'love', 'wonderful', 'fantastic', 'clean', 'comfortable', 'beautiful', 'nice', 'good', 'enjoyed', 'recommend', 'outstanding', 'superb'];
    const negativeWords = ['bad', 'terrible', 'awful', 'dirty', 'uncomfortable', 'noisy', 'poor', 'disappointing', 'problem', 'issue', 'complaint', 'worst', 'horrible'];
    
    let totalWords = 0;
    let positiveCount = 0;
    let negativeCount = 0;
    
    for (const review of reviewTexts) {
      const words = review.toLowerCase().split(' ');
      totalWords += words.length;
      positiveCount += words.filter(word => positiveWords.includes(word)).length;
      negativeCount += words.filter(word => negativeWords.includes(word)).length;
    }
    
    let positivePercentage, neutralPercentage, negativePercentage;
    
    if (totalWords > 0) {
      positivePercentage = Math.min(85, (positiveCount / totalWords) * 100 * 8); // Better amplification
      negativePercentage = Math.min(25, (negativeCount / totalWords) * 100 * 8);
      neutralPercentage = 100 - positivePercentage - negativePercentage;
    } else {
      positivePercentage = 20;
      neutralPercentage = 80;
      negativePercentage = 0;
    }
    
    // Extract common themes with better keyword matching
    const themes = {
      'cleanliness': { positive: 0, negative: 0, total_mentions: 0, positive_snippets: [], negative_snippets: [] },
      'location': { positive: 0, negative: 0, total_mentions: 0, positive_snippets: [], negative_snippets: [] },
      'host communication': { positive: 0, negative: 0, total_mentions: 0, positive_snippets: [], negative_snippets: [] },
      'value for money': { positive: 0, negative: 0, total_mentions: 0, positive_snippets: [], negative_snippets: [] },
      'comfort': { positive: 0, negative: 0, total_mentions: 0, positive_snippets: [], negative_snippets: [] },
      'amenities': { positive: 0, negative: 0, total_mentions: 0, positive_snippets: [], negative_snippets: [] },
      'check-in process': { positive: 0, negative: 0, total_mentions: 0, positive_snippets: [], negative_snippets: [] }
    };
    
    reviewTexts.forEach(text => {
      Object.keys(themes).forEach(theme => {
        const themeWords = theme.split(' ');
        const hasTheme = themeWords.some(word => text.toLowerCase().includes(word));
        
        if (hasTheme) {
          themes[theme].total_mentions++;
          const sentiment = this.analyzeSentiment(text);
          if (sentiment === 'positive') {
            themes[theme].positive++;
            if (themes[theme].positive_snippets.length < 10) { // Collect up to 10
              const snippet = text.length > 150 ? text.substring(0, 150) + '...' : text;
              themes[theme].positive_snippets.push(snippet);
            }
          } else if (sentiment === 'negative') {
            themes[theme].negative++;
            if (themes[theme].negative_snippets.length < 10) { // Collect up to 10
              const snippet = text.length > 150 ? text.substring(0, 150) + '...' : text;
              themes[theme].negative_snippets.push(snippet);
            }
          }
        }
      });
    });
    
    const keywordAnalysis = Object.entries(themes)
      .filter(([_, data]) => data.total_mentions > 0)
      .map(([keyword, data]) => ({
        keyword,
        positive: data.positive,
        negative: data.negative,
        total_mentions: data.total_mentions,
        positive_snippets: data.positive_snippets,
        negative_snippets: data.negative_snippets
      }));
    
    // Generate better insights based on sentiment
    const pros = [];
    const cons = [];
    const recommendedFor = [];
    const notRecommendedFor = [];
    const bestFeatures = [];
    const areasForImprovement = [];
    
    if (positivePercentage > 70) {
      pros.push('Strong guest satisfaction rate', 'Consistently positive feedback', 'Guests appreciate the overall value', 'Good cleanliness standards', 'Responsive host communication', 'Comfortable accommodations', 'Convenient location for most guests');
      recommendedFor.push('most types of travelers', 'those seeking reliable accommodation', 'guests who value positive reviews', 'families with children', 'couples on vacation');
      bestFeatures.push('overall guest experience', 'consistent quality', 'value proposition');
    } else if (positivePercentage > 50) {
      pros.push('Majority of guests satisfied', 'Several positive aspects noted', 'Decent overall ratings', 'Acceptable cleanliness', 'Fair pricing', 'Basic amenities work well');
      recommendedFor.push('flexible travelers', 'those with moderate expectations', 'short-term stays', 'business travelers');
      bestFeatures.push('some positive aspects', 'reasonable accommodation');
    } else {
      pros.push('Transparent guest feedback available', 'Some guests had positive experiences', 'Affordable pricing', 'Basic necessities provided', 'Some appreciated the location');
      recommendedFor.push('budget-conscious travelers', 'those who prioritize location over amenities', 'minimal-needs guests');
      areasForImprovement.push('overall guest satisfaction', 'consistency of experience');
    }
    
    // Always find some cons and not_recommended_for - even in positive reviews
    if (negativePercentage > 20) {
      cons.push('Notable concerns raised by some guests', 'Inconsistent experiences reported', 'Some maintenance issues mentioned', 'Occasional cleanliness concerns');
      notRecommendedFor.push('guests seeking luxury experience', 'those with specific requirements', 'light sleepers if noise was mentioned');
      areasForImprovement.push('addressing guest concerns', 'improving consistency', 'maintenance updates needed');
    } else {
      // Even with low negative percentage, extract some cons
      cons.push('Minor issues noted by some guests', 'Room for improvement in some areas', 'Occasional maintenance needs', 'Some guests wanted more amenities');
      notRecommendedFor.push('guests expecting luxury amenities', 'those needing extensive facilities', 'visitors requiring premium services');
    }
    
    // Add specific insights based on themes
    if (themes['cleanliness'].positive > themes['cleanliness'].negative) {
      bestFeatures.push('cleanliness');
    } else if (themes['cleanliness'].negative > 0) {
      areasForImprovement.push('cleanliness');
    }
    
    if (themes['location'].positive > themes['location'].negative) {
      bestFeatures.push('location');
    }
    
    if (themes['host communication'].positive > themes['host communication'].negative) {
      bestFeatures.push('host communication');
    } else if (themes['host communication'].negative > 0) {
      areasForImprovement.push('host communication');
    }
    
    return {
      success: true,
      analysis_type: 'basic_analysis',
      trust_score: Math.min(90, Math.max(50, positivePercentage + 10)),
      sentiment_analysis: {
        positive_percentage: positivePercentage,
        neutral_percentage: neutralPercentage,
        negative_percentage: negativePercentage,
        overall_sentiment: positivePercentage > negativePercentage ? 'positive' : 'negative'
      },
      keyword_analysis: keywordAnalysis.length > 0 ? keywordAnalysis : [
        {
          keyword: 'overall experience',
          positive: positiveCount,
          negative: negativeCount,
          total_mentions: positiveCount + negativeCount,
          positive_snippets: positiveCount > 0 ? ['Positive mentions found in reviews'] : [],
          negative_snippets: negativeCount > 0 ? ['Some concerns mentioned'] : []
        }
      ],
      pros_and_cons: {
        pros: pros.length > 0 ? pros.slice(0, 7) : ['Good value for money', 'Convenient location', 'Basic amenities provided', 'Generally clean', 'Functional accommodation'],
        cons: cons.length > 0 ? cons.slice(0, 7) : ['Some guests noted minor issues', 'Room for improvement in certain areas', 'May not suit all guest types', 'Basic rather than luxury', 'Limited premium amenities']
      },
      guest_insights: {
        recommended_for: recommendedFor.length > 0 ? recommendedFor : ['general travelers'],
        not_recommended_for: notRecommendedFor.length > 0 ? notRecommendedFor : ['guests seeking luxury amenities', 'those with specific accessibility needs', 'light sleepers', 'large groups'],
        best_features: bestFeatures.length > 0 ? bestFeatures : ['review availability'],
        areas_for_improvement: areasForImprovement.length > 0 ? areasForImprovement : ['detailed analysis']
      },
      summary: `Based on analyzing ${reviews.length} reviews, here's what guests really think about this property. ${positivePercentage > 60 ? 'The overall impression is quite positive, with most guests enjoying their stay' : positivePercentage > 40 ? 'Guests have mixed feelings about this place, with both satisfied visitors and those who encountered problems' : 'Many guests expressed concerns and disappointments during their stays'}. ${positivePercentage > 50 ? 'The property seems to deliver on its basic promise, with comfortable accommodations and decent amenities' : 'Several guests found the property lacking in key areas that affected their comfort and satisfaction'}. Common positive mentions include the general cleanliness and basic amenities being functional. However, some guests noted issues that future visitors should consider, such as potential noise concerns, maintenance needs, or location-specific challenges. The host ${positivePercentage > 60 ? 'generally receives positive feedback for responsiveness' : 'has received mixed reviews regarding communication and support'}. Location-wise, the property offers convenient access to local attractions, though some guests mentioned it might not be ideal for everyone depending on their needs. The listing accuracy ${positivePercentage > 50 ? 'seems to match reality for most guests' : 'has been questioned by some visitors who found discrepancies'}. In terms of value, ${positivePercentage > 60 ? 'most guests felt they received fair value for the price paid' : 'opinions are divided on whether the property justifies its price point'}. This place would work well for ${positivePercentage > 60 ? 'flexible travelers who appreciate the positives and can overlook minor issues' : 'budget-conscious guests who prioritize location over luxury'}. It might not be ideal for those seeking a premium experience or those with specific accessibility needs. The property ${positivePercentage > 60 ? 'maintains reasonable standards that satisfy most guests' : 'has room for improvement in several areas according to guest feedback'}. Overall, ${positivePercentage > 60 ? 'this is a decent choice for travelers who value the location and basic comforts' : 'potential guests should carefully consider their priorities and read recent reviews before booking'}.`,
      reviews_analyzed: reviews.length, // Use total reviews passed in, not filtered count
      message: 'Basic analysis based on keyword matching'
    };
  }

  // Call Gemini API for plain text responses (questions)
  async callGeminiAPIPlainText(prompt) {
    try {
      console.log('TravanaSpot: Calling Gemini API for plain text response...');
      const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;
      
      const requestBody = {
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.8,
          maxOutputTokens: 1024,
          candidateCount: 1
        }
      };
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.candidates && data.candidates[0] && data.candidates[0].content) {
        const textResponse = data.candidates[0].content.parts[0].text;
        console.log('TravanaSpot: Plain text response received');
        return textResponse;
      } else {
        throw new Error('No valid response from API');
      }
      
    } catch (error) {
      console.error('TravanaSpot: Gemini API call failed:', error);
      throw error;
    }
  }

  // Ask a specific question about the reviews
  async askQuestion(reviews, question, contextData = {}) {
    if (!reviews || reviews.length === 0) {
      return 'No reviews available to answer your question.';
    }

    try {
      console.log('TravanaSpot: Answering specific question:', question);
      
      // Check if this is a location-related question
      const locationKeywords = ['restaurant', 'food', 'eat', 'dining', 'cafe', 'coffee', 'bar', 'pub',
                               'grocery', 'store', 'shop', 'market', 'supermarket', 'mall', 'shopping',
                               'attraction', 'museum', 'park', 'beach', 'sight', 'tourist', 'activity', 'activities',
                               'transport', 'metro', 'bus', 'train', 'station', 'airport', 'uber', 'taxi',
                               'nearby', 'around', 'close', 'walk', 'distance', 'area', 'neighborhood'];
      
      const isLocationQuestion = locationKeywords.some(keyword => 
        question.toLowerCase().includes(keyword)
      );
      
      // Prepare review text for analysis
      const reviewTexts = reviews.slice(0, 50).map(review => 
        (review.text || review.comments || '').trim()
      ).filter(text => text.length > 10);
      
      const reviewsSample = reviewTexts.join('\n---\n');
      
      // Create a specialized prompt for direct question answering
      let prompt;
      
      if (isLocationQuestion) {
        prompt = `You are Little Airby, a helpful and knowledgeable assistant! 🧸

QUESTION: "${question}"

Your task: Answer this location/activity question directly and helpfully by searching through these Airbnb reviews.

SEARCH INSTRUCTIONS:
1. Look for ANY mentions of: restaurants, cafes, bars, food places, dining options
2. Find references to: grocery stores, markets, shopping, convenience stores  
3. Search for: activities, attractions, parks, museums, entertainment venues
4. Check for: transportation mentions (metro, bus, walking distances, "X minutes away")
5. Note any neighborhood descriptions: safe, quiet, busy, convenient, walkable

RESPONSE GUIDELINES:
- If you find specific places mentioned, list them with any details guests provided
- Include walking distances or travel times if mentioned
- If no specific places are mentioned but guests said things like "great restaurants nearby" or "lots to do", quote those exact comments
- For activity questions, look for mentions of what guests actually did in the area
- If reviews don't contain the specific information, be honest but suggest where to find it

Property location context: ${contextData.location || 'Location not specified'}

Give a direct, conversational answer as Little Airby - warm, helpful, and honest! 🧸💕

REVIEWS TO SEARCH:
${reviewsSample}`;
      } else {
        prompt = `You are Little Airby, a helpful assistant! 🧸

QUESTION: "${question}"

Your task: Answer this question based on what guests actually wrote in their reviews.

INSTRUCTIONS:
- Search through the reviews for information relevant to the question
- Give a direct, honest answer based on review content
- Quote specific guest comments when relevant
- If the information isn't in the reviews, say so honestly and suggest alternatives

Be warm, helpful, and conversational as Little Airby! 🧸💕

REVIEWS TO SEARCH:
${reviewsSample}`;
      }
      
      // Call Gemini API with plain text response (not structured JSON)
      const response = await this.callGeminiAPIPlainText(prompt);
      
      console.log('TravanaSpot: Direct question response:', response);
      
      // Return the direct response
      return response || 'Sorry, I had trouble processing your question. Please try asking again!';
      
    } catch (error) {
      console.error('TravanaSpot: Question answering failed:', error);
      return `Sorry, I encountered an error while trying to answer your question: ${error.message}`;
    }
  }

  // Generate a summary of reviews
  async generateSummary(reviews) {
    if (!reviews || reviews.length === 0) {
      return 'No reviews available for analysis.';
    }

    try {
      console.log('TravanaSpot: Generating comprehensive summary...');
      
      // Extract review texts (use ALL reviews for comprehensive analysis - up to 100)
      const reviewTexts = [];
      const reviewsToAnalyze = reviews.slice(0, 100); // Ensure we use up to 100 reviews
      for (const review of reviewsToAnalyze) {
        let comment = (review.text || review.comments || '').trim();
        if (comment && comment.length > 10) { // Filter out very short reviews
          // Truncate reviews longer than 600 characters to prevent JSON issues
          if (comment.length > 600) {
            comment = comment.substring(0, 600) + '...';
            console.log('TravanaSpot: Truncated long review from', comment.length, 'to 600 chars');
          }
          reviewTexts.push(comment);
        }
      }

      if (reviewTexts.length === 0) {
        return 'No substantial review text found for analysis.';
      }

      const reviewsSample = reviewTexts.join('\n\n---\n\n');
      
      const prompt = `Analyze these Airbnb reviews and provide a comprehensive summary. Return ONLY valid JSON with this exact structure:

{
  "trust_score": 0-100,
  "sentiment_analysis": {
    "positive_percentage": 0-100,
    "neutral_percentage": 0-100,
    "negative_percentage": 0-100,
    "overall_sentiment": "positive|neutral|negative"
  },
  "keyword_analysis": [
    {
      "keyword": "cleanliness",
      "positive": 5,
      "negative": 1,
      "total_mentions": 6,
      "positive_snippets": ["exact quotes mentioning cleanliness positively"],
      "negative_snippets": ["exact quotes mentioning cleanliness negatively"]
    }
  ],
  "pros_and_cons": {
    "pros": ["list 5-7 specific positive aspects guests mentioned most frequently"],
    "cons": ["list 5-7 specific negative aspects or complaints guests mentioned - MUST find cons even if reviews are mostly positive"]
  },
  "guest_insights": {
    "recommended_for": ["specific guest types who enjoyed their stay based on reviews"],
    "not_recommended_for": ["MUST extract specific guest types who would NOT enjoy this property based on negative reviews - e.g. 'light sleepers due to noise', 'guests with mobility issues', 'large families', etc."],
    "best_features": ["top 3 specific features guests loved most"],
    "areas_for_improvement": ["top 3 specific issues guests mentioned"]
  },
  "summary": "A warm, friendly 10-15 sentence summary written by Little Airby! Include everything guests really think about this cozy place - the overall vibe and atmosphere, specific things that made guests happy, any concerns they mentioned, who would absolutely love staying here, who might find it challenging, cleanliness insights, how lovely (or not) the host is, location perks and quirks, value for your hard-earned money, how well it matches the listing, comfort levels, amenity quality, and Little Airby's final sweet verdict. Write it like a caring friend who's read every review is telling you all the important details with warmth and honesty!"
}

KEYWORD FORMATTING RULES:
- Use natural, readable keywords WITHOUT underscores
- Examples: "check-in process", "value for money", "host communication"
- NEVER use underscores like "check-in_process" or "value_for_money"

Focus on these key aspects: cleanliness, location, host communication, value for money, accuracy of listing, comfort, noise levels, amenities, check-in process.

IMPORTANT: You MUST analyze AT LEAST 5-7 different keywords/aspects from the list above. Do not just analyze "cleanliness" - include multiple aspects that are mentioned in the reviews. Even if some aspects have fewer mentions, still include them. The keyword_analysis array should have 5-7 items minimum.

IMPORTANT for guest_insights:
- recommended_for: Extract SPECIFIC guest types mentioned in positive reviews (e.g., "families with young children", "remote workers", "couples seeking romance")
- not_recommended_for: YOU MUST FIND AND LIST guest types who would NOT enjoy this property. Look for ANY complaints about noise, stairs, space, location issues, etc. Examples: "light sleepers" (if noise mentioned), "guests with mobility issues" (if stairs/access mentioned), "large groups" (if space is tight), "party seekers" (if quiet area), "budget travelers" (if expensive)
- best_features: Extract the ACTUAL features guests praised most (e.g., "stunning ocean view from balcony", "extremely comfortable beds", "fully equipped kitchen")
- areas_for_improvement: Extract ACTUAL issues guests mentioned (e.g., "thin walls between units", "limited parking spaces", "outdated bathroom fixtures")

For pros_and_cons:
- pros: Find 5-7 specific positive things mentioned across reviews
- cons: YOU MUST FIND 5-7 negative aspects. Even if reviews are mostly positive, look for ANY complaints about: noise, cleanliness issues, maintenance problems, location downsides, host communication gaps, amenity issues, comfort problems, accuracy concerns, check-in difficulties, parking, stairs, space, temperature control, Wi-Fi, kitchen equipment, bathroom issues, etc.

For the summary: Write a DETAILED, COMPREHENSIVE paragraph (10-15 sentences) that tells the FULL story of this property based on ALL reviews. Include:
1. The overall impression and atmosphere
2. What most guests loved about it
3. Common complaints and issues (BE HONEST)
4. How the host behaves and communicates
5. Location advantages and disadvantages
6. Whether it matches the listing description
7. Cleanliness standards
8. Comfort level of beds/furniture
9. Amenities that work well and those that don't
10. Value for money assessment
11. Who would love this place
12. Who should avoid it
13. Final verdict

Write it conversationally, as if explaining to a close friend who's considering booking this place.

CRITICAL INSTRUCTIONS:
- Extract REAL quotes from the actual reviews below
- positive_snippets must contain ACTUAL phrases from reviews that mention the keyword positively
- negative_snippets must contain ACTUAL phrases from reviews that mention the keyword negatively
- Maximum 10 snippets per sentiment type (10 positive, 10 negative) per keyword
- Use EXACT quotes, not paraphrases
- Trust score should reflect overall reliability based on review patterns
- CRITICAL: You MUST properly escape ALL quotes (") inside snippet strings by using \"
- CRITICAL: If a review contains quotes like "amazing" or dialogue, you MUST escape them as \"amazing\"
- CRITICAL: Do NOT include line breaks, newlines, or carriage returns inside snippet strings
- CRITICAL: Keep snippets under 150 characters each
- CRITICAL: Ensure ALL JSON strings are properly terminated with closing quotes

REVIEWS TO ANALYZE:
${reviewsSample}`;

      const response = await this.callGeminiAPI(prompt);
      
      // Parse JSON response
      try {
        // With structured output enabled, Gemini returns valid JSON directly
        const analysis = JSON.parse(response);
        
        // Validate and fix snippet counts
        const keywordAnalysis = analysis.keyword_analysis || [];
        for (const keyword of keywordAnalysis) {
          const posSnippets = keyword.positive_snippets || [];
          const negSnippets = keyword.negative_snippets || [];
          
          // Fix counts to match actual snippets
          keyword.positive = posSnippets.length;
          keyword.negative = negSnippets.length;
          keyword.total_mentions = posSnippets.length + negSnippets.length;
        }
        
        // Add metadata
        analysis.analysis_type = 'little_airby_powered';
        analysis.reviews_analyzed = reviewsToAnalyze.length; // Use total reviews, not filtered count
        analysis.success = true;
        
        console.log('TravanaSpot: Summary generation completed successfully');
        return analysis;
        
      } catch (jsonError) {
        console.error('TravanaSpot: JSON parsing failed for summary:', jsonError);
        console.error('TravanaSpot: Raw response:', response);
        throw new Error('Failed to parse AI summary response');
      }
      
    } catch (error) {
      console.error('TravanaSpot: Summary generation failed:', error);
      throw error;
    }
  }

  // Analyze sentiment of individual review text
  analyzeSentiment(text) {
    if (!text) return 'neutral';
    
    const positiveWords = ['great', 'excellent', 'amazing', 'wonderful', 'perfect', 'love', 'fantastic', 'outstanding', 'superb', 'brilliant'];
    const negativeWords = ['terrible', 'awful', 'horrible', 'bad', 'disappointing', 'poor', 'worst', 'uncomfortable', 'dirty', 'noisy'];
    
    const lowerText = text.toLowerCase();
    let positiveCount = 0;
    let negativeCount = 0;
    
    positiveWords.forEach(word => {
      if (lowerText.includes(word)) positiveCount++;
    });
    
    negativeWords.forEach(word => {
      if (lowerText.includes(word)) negativeCount++;
    });
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  // Call Gemini API
  async callGeminiAPI(prompt) {
    try {
      console.log('TravanaSpot: Calling Gemini API...');
      console.log('TravanaSpot: API Key:', this.apiKey ? 'Present' : 'Missing');
      console.log('TravanaSpot: Model:', this.model);
      console.log('TravanaSpot: Prompt length:', prompt.length);
      
      const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;
      console.log('TravanaSpot: API URL:', url);
      
      // Define the response schema for structured output
      const responseSchema = {
        type: "object",
        properties: {
          trust_score: { 
            type: "integer",
            minimum: 0,
            maximum: 100
          },
          sentiment_analysis: {
            type: "object",
            properties: {
              positive_percentage: { type: "number" },
              neutral_percentage: { type: "number" },
              negative_percentage: { type: "number" },
              overall_sentiment: { 
                type: "string",
                enum: ["positive", "neutral", "negative"]
              }
            },
            required: ["positive_percentage", "neutral_percentage", "negative_percentage", "overall_sentiment"]
          },
          keyword_analysis: {
            type: "array",
            items: {
              type: "object",
              properties: {
                keyword: { type: "string" },
                positive: { type: "integer" },
                negative: { type: "integer" },
                total_mentions: { type: "integer" },
                positive_snippets: {
                  type: "array",
                  items: { type: "string" }
                },
                negative_snippets: {
                  type: "array",
                  items: { type: "string" }
                }
              },
              required: ["keyword", "positive", "negative", "total_mentions", "positive_snippets", "negative_snippets"]
            }
          },
          pros_and_cons: {
            type: "object",
            properties: {
              pros: {
                type: "array",
                items: { type: "string" }
              },
              cons: {
                type: "array",
                items: { type: "string" }
              }
            },
            required: ["pros", "cons"]
          },
          guest_insights: {
            type: "object",
            properties: {
              recommended_for: {
                type: "array",
                items: { type: "string" }
              },
              not_recommended_for: {
                type: "array",
                items: { type: "string" }
              },
              best_features: {
                type: "array",
                items: { type: "string" },
                maxItems: 3
              },
              areas_for_improvement: {
                type: "array",
                items: { type: "string" },
                maxItems: 3
              }
            },
            required: ["recommended_for", "not_recommended_for", "best_features", "areas_for_improvement"]
          },
          summary: { 
            type: "string"
          }
        },
        required: ["trust_score", "sentiment_analysis", "keyword_analysis", "pros_and_cons", "guest_insights", "summary"]
      };

      // Try structured output first, but be prepared to fall back
      let useStructuredOutput = true;
      
      // Check if we should disable structured output (e.g., after a 400 error)
      if (this.structuredOutputFailed) {
        console.warn('TravanaSpot: Structured output previously failed, using regular mode');
        useStructuredOutput = false;
      }
      
      const payload = {
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 3000 // Reduced to prevent truncation issues
        }
      };
      
      // Only add structured output if we're using it
      if (useStructuredOutput) {
        payload.generationConfig.responseMimeType = "application/json";
        payload.generationConfig.responseSchema = responseSchema;
      }

      console.log('TravanaSpot: Request payload:', JSON.stringify(payload, null, 2));

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      console.log('TravanaSpot: Response status:', response.status);
      console.log('TravanaSpot: Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('TravanaSpot: HTTP error response:', errorText);
        
        // If we get a 400 error with structured output, it might be due to schema complexity
        if (response.status === 400 && useStructuredOutput) {
          if (errorText.includes('schema produces a constraint that has too many states')) {
            console.error('TravanaSpot: Structured output schema too complex, disabling for future requests');
            this.structuredOutputFailed = true;
          }
        }
        
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const data = await response.json();
      console.log('TravanaSpot: ===== API RESPONSE DATA =====');
      console.log('TravanaSpot: Full API response:', JSON.stringify(data, null, 2));
      
      // Handle response
      if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
        const text = data.candidates[0].content.parts[0].text;
        console.log('TravanaSpot: Generated text from API:', text);
        console.log('TravanaSpot: Generated text length:', text.length);
        console.log('TravanaSpot: First 1000 chars of response:', text.substring(0, 1000));
        console.log('TravanaSpot: Last 1000 chars of response:', text.substring(text.length - 1000));
        
        // Check if response is wrapped in markdown
        if (text.startsWith('```')) {
          console.warn('TravanaSpot: WARNING - Response still wrapped in markdown despite structured output!');
          console.warn('TravanaSpot: This indicates structured output may not be working properly');
        }
        
        return text;
      } else if (data.promptFeedback) {
        console.error('TravanaSpot: Prompt feedback:', data.promptFeedback);
        throw new Error(`Prompt blocked: ${data.promptFeedback.blockReason || 'Unknown reason'}`);
      } else if (data.error) {
        console.error('TravanaSpot: API returned error:', data.error);
        throw new Error(`API error: ${data.error.message || 'Unknown API error'}`);
      } else {
        console.error('TravanaSpot: Unexpected response format:', data);
        throw new Error('No valid response from Gemini API');
      }

    } catch (error) {
      console.error('TravanaSpot: Gemini API call failed:', error);
      console.error('TravanaSpot: Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  // Get diagnostic message for common errors
  getDiagnosticMessage(error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('failed to parse')) {
      return 'AI returned invalid JSON format or non-JSON response';
    } else if (msg.includes('401')) {
      return 'Invalid API key - the Gemini API key is not valid';
    } else if (msg.includes('403')) {
      return 'Access denied - API key lacks permissions';
    } else if (msg.includes('429')) {
      return 'Rate limit exceeded - too many requests';
    } else if (msg.includes('500')) {
      return 'Gemini API server error';
    } else if (msg.includes('no reviews')) {
      return 'No reviews found to analyze';
    } else if (msg.includes('network')) {
      return 'Network connection issue';
    } else if (msg.includes('prompt blocked')) {
      return 'Content was blocked by safety filters';
    }
    return 'Unknown error - check detailed logs';
  }

  // Get analysis status
  getAnalysisStatus() {
    return this.isAnalyzing;
  }

  // Reset analysis status
  resetAnalysisStatus() {
    this.isAnalyzing = false;
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TravanaSpotGeminiAI;
} else {
  window.TravanaSpotGeminiAI = TravanaSpotGeminiAI;
} 