# CityMood API Documentation

## Overview

The CityMood API provides weather data and generates weather-themed AI images and animated videos for any city in the world. Images and videos are generated asynchronously - submit a job and poll for completion.

**Base URL:** `https://citymood-production.up.railway.app/api/v1`

## Authentication

All requests (except registration) require a Bearer token in the Authorization header:

```
Authorization: Bearer YOUR_API_KEY
```

To get an API key, register your device using the `/register` endpoint.

## Rate Limits

- **Standard keys:** 1 active job at a time per endpoint type
- **Admin keys:** Unlimited concurrent jobs

If you submit a new job while one is in progress, you'll receive a 429 response
with the existing job_id so you can continue polling it.

---

## Endpoints Overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/register` | POST | Register device and get API key |
| `/city-weather` | GET | Get current weather for a city (synchronous) |
| `/city-image` | POST | Generate AI image for a city's weather |
| `/city-image/:jobId` | GET | Check image generation status |
| `/city-video` | POST | Generate animated video for a city's weather |
| `/city-video/:jobId` | GET | Check video generation status |
| `/cities/{city}.png` | GET | Get animated PNG for iOS widgets (see Widget Endpoint) |

---

## Endpoints

### Register Device

**POST** `/register`

Register a device to receive an API key. If the device is already registered, returns the existing key.

**No authentication required** for this endpoint.

#### Request Body

| Field       | Type   | Required | Description                                              |
| ----------- | ------ | -------- | -------------------------------------------------------- |
| device_id   | string | Yes      | Unique device identifier (UUID format from iOS identifierForVendor) |
| device_name | string | No       | Device name (e.g., "iPhone 15 Pro")                      |
| app_version | string | No       | App version (e.g., "1.0.0")                              |

#### Example Request

```bash
curl -X POST https://citymood-production.up.railway.app/api/v1/register \
  -H "Content-Type: application/json" \
  -d '{"device_id": "550e8400-e29b-41d4-a716-446655440000", "device_name": "iPhone 15 Pro", "app_version": "1.0.0"}'
```

#### Response (201 Created - New Registration)

```json
{
  "success": true,
  "data": {
    "api_key": "cm_live_a1b2c3d4e5f6789012345678901234ab",
    "device_id": "550e8400-e29b-41d4-a716-446655440000",
    "created_at": "2025-12-01T14:30:00.000Z",
    "rate_limit": {
      "max_concurrent_jobs": 1
    }
  },
  "meta": {
    "request_id": "550e8400-e29b-41d4-a716-446655440001",
    "processing_time_ms": 45
  }
}
```

#### Response (200 OK - Already Registered)

Same format as above. If the device was already registered, returns the existing API key.

---

### Get Weather

**GET** `/city-weather`

Get current weather data for a city. This is a synchronous endpoint - returns immediately.
Weather data is cached for 1 hour.

#### Query Parameters

| Parameter | Type   | Required | Description                                    |
| --------- | ------ | -------- | ---------------------------------------------- |
| city      | string | Yes      | City name (e.g., "Paris")                      |
| country   | string | No       | Country for disambiguation (e.g., "France")   |

#### Example Request

```bash
curl "https://citymood-production.up.railway.app/api/v1/city-weather?city=Paris&country=France" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "city": "Paris",
    "country": "France",
    "weather": {
      "category": "cloudy",
      "description": "Partly Cloudy",
      "temperature_c": 12.5,
      "temperature_f": 54.5,
      "humidity": 76,
      "wind_kph": 15.2,
      "is_day": true
    },
    "cached": true
  },
  "meta": {
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "processing_time_ms": 95
  }
}
```

The `cached` field indicates whether the weather data was served from cache (`true`) or freshly fetched (`false`).

---

### Submit Image Job

**POST** `/city-image`

Generate an AI image that captures the mood of a city based on its current weather.
Returns immediately with a job ID - poll the status endpoint for completion.

Images are cached by city + weather category + time of day.

#### Request Body

| Field   | Type   | Required | Description                                    |
| ------- | ------ | -------- | ---------------------------------------------- |
| city    | string | Yes      | City name (e.g., "Paris")                      |
| country | string | No       | Country for disambiguation (e.g., "France")   |

#### Example Request

```bash
curl -X POST "https://citymood-production.up.railway.app/api/v1/city-image" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"city": "Paris", "country": "France"}'
```

#### Response (202 Accepted)

```json
{
  "success": true,
  "data": {
    "job_id": "job_img_abc123",
    "status": "pending",
    "status_url": "/api/v1/city-image/job_img_abc123",
    "estimated_time_seconds": 15
  },
  "meta": {
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "processing_time_ms": 42
  }
}
```

---

### Check Image Job Status

**GET** `/city-image/:jobId`

Check the status of an image generation job.

#### Example Request

```bash
curl "https://citymood-production.up.railway.app/api/v1/city-image/job_img_abc123" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

#### Response (Processing)

```json
{
  "success": true,
  "data": {
    "job_id": "job_img_abc123",
    "status": "processing",
    "stage": "generating_image",
    "progress": {
      "current_step": 2,
      "total_steps": 2,
      "message": "Creating your city mood image..."
    }
  },
  "meta": {
    "request_id": "550e8400-e29b-41d4-a716-446655440001",
    "processing_time_ms": 12
  }
}
```

#### Response (Completed)

```json
{
  "success": true,
  "data": {
    "job_id": "job_img_abc123",
    "status": "completed",
    "result": {
      "city": "Paris",
      "country": "France",
      "image_url": "https://storage.example.com/paris/cloudy_day.png",
      "weather": {
        "category": "cloudy",
        "description": "Partly Cloudy",
        "temperature_c": 12.5,
        "temperature_f": 54.5,
        "humidity": 76,
        "wind_kph": 15.2,
        "is_day": true
      },
      "generated_at": "2025-12-01T14:30:00.000Z",
      "cached": false
    }
  },
  "meta": {
    "request_id": "550e8400-e29b-41d4-a716-446655440002",
    "processing_time_ms": 8
  }
}
```

#### Image Processing Stages

| Stage              | Step | Description                        |
| ------------------ | ---- | ---------------------------------- |
| fetching_weather   | 1/2  | Fetching current weather data      |
| generating_image   | 2/2  | Creating city mood image with AI   |

---

### Submit Video Job

**POST** `/city-video`

Generate an animated video that brings the city's weather mood to life.
Returns immediately with a job ID - poll the status endpoint for completion.

Videos are cached by city + weather category + time of day. The video endpoint
automatically generates the base image if one doesn't exist for the current conditions.

#### Request Body

| Field   | Type   | Required | Description                                    |
| ------- | ------ | -------- | ---------------------------------------------- |
| city    | string | Yes      | City name (e.g., "Paris")                      |
| country | string | No       | Country for disambiguation (e.g., "France")   |

#### Example Request

```bash
curl -X POST https://citymood-production.up.railway.app/api/v1/city-video \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"city": "Paris", "country": "France"}'
```

#### Response (202 Accepted)

```json
{
  "success": true,
  "data": {
    "job_id": "job_abc123xyz",
    "status": "pending",
    "status_url": "/api/v1/city-video/job_abc123xyz",
    "estimated_time_seconds": 60
  },
  "meta": {
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "processing_time_ms": 45
  }
}
```

---

### Check Video Job Status

**GET** `/city-video/:jobId`

Check the status of a video generation job.

#### Example Request

```bash
curl https://citymood-production.up.railway.app/api/v1/city-video/job_abc123xyz \
  -H "Authorization: Bearer YOUR_API_KEY"
```

#### Response (Processing)

```json
{
  "success": true,
  "data": {
    "job_id": "job_abc123xyz",
    "status": "processing",
    "stage": "generating_video",
    "progress": {
      "current_step": 3,
      "total_steps": 4,
      "message": "Generating video animation..."
    }
  },
  "meta": {
    "request_id": "550e8400-e29b-41d4-a716-446655440001",
    "processing_time_ms": 12
  }
}
```

#### Response (Completed)

```json
{
  "success": true,
  "data": {
    "job_id": "job_abc123xyz",
    "status": "completed",
    "result": {
      "city": "Paris",
      "country": "France",
      "video_url": "https://storage.example.com/paris/sunny_day.mp4",
      "weather": {
        "category": "sunny",
        "description": "Clear",
        "temperature_c": 22,
        "temperature_f": 71.6,
        "humidity": 45,
        "wind_kph": 12,
        "is_day": true
      },
      "generated_at": "2025-12-01T14:30:00.000Z",
      "cached": false
    }
  },
  "meta": {
    "request_id": "550e8400-e29b-41d4-a716-446655440002",
    "processing_time_ms": 45230
  }
}
```

#### Response (Failed)

```json
{
  "success": false,
  "error": {
    "code": "VIDEO_GENERATION_FAILED",
    "message": "Video generation failed: timeout exceeded",
    "details": {
      "job_id": "job_abc123xyz",
      "stage": "generating_video"
    }
  },
  "meta": {
    "request_id": "550e8400-e29b-41d4-a716-446655440003"
  }
}
```

---

### Widget Endpoint (iOS)

**GET** `/cities/{city}.png?token=YOUR_API_KEY`

Returns an animated PNG (APNG) of a city with a weather overlay, designed for iOS widgets.
Unlike other endpoints, this uses query parameter authentication (suitable for image URLs).

**Note:** This endpoint is outside the `/api/v1` path. Use the full URL format.

#### Query Parameters

| Parameter | Type   | Required | Description                                    |
| --------- | ------ | -------- | ---------------------------------------------- |
| token     | string | Yes      | Your API key (same as used in Bearer auth)     |

#### Example Request

```bash
curl "https://citymood-production.up.railway.app/cities/london.png?token=YOUR_API_KEY" \
  --output london-widget.apng
```

#### Response (200 OK - Success)

Returns an animated PNG file with:
- 360x360 resolution
- Weather overlay at bottom: "London • 22°C • Sunny"
- Frosted semi-transparent background bar
- Infinite loop animation

**Headers:**
```
Content-Type: image/apng
Cache-Control: public, max-age=1800, stale-while-revalidate=3600
X-Weather-Hash: d2a8f7bf72c2
X-Cached: true
```

#### Response (202 Accepted - Generating)

If the video for the current weather conditions hasn't been generated yet:

**Headers:**
```
Content-Type: image/png
Retry-After: 120
X-Status: generating
X-City: london
```

Returns a placeholder PNG. Retry after ~2 minutes.

#### Response (401 Unauthorized)

```json
{
  "error": "Unauthorized",
  "message": "Missing token parameter"
}
```

#### Response (404 Not Found)

```json
{
  "error": "City not found",
  "message": "Could not find weather data for \"xyz\""
}
```

#### iOS Widget Usage

```swift
let city = "london"
let token = "YOUR_API_KEY"
let imageURL = URL(string: "https://citymood-production.up.railway.app/cities/\(city).png?token=\(token)")!

// Use in SwiftUI widget
AsyncImage(url: imageURL)
```

---

## Processing Stages

### Image Generation (2 stages)

| Stage              | Step | Description                        |
| ------------------ | ---- | ---------------------------------- |
| fetching_weather   | 1/2  | Fetching current weather data      |
| generating_image   | 2/2  | Creating city mood image with AI   |

### Video Generation (4 stages)

| Stage              | Step | Description                        |
| ------------------ | ---- | ---------------------------------- |
| fetching_weather   | 1/4  | Fetching current weather data      |
| generating_image   | 2/4  | Creating city diorama image        |
| generating_video   | 3/4  | Animating weather effects          |
| processing_video   | 4/4  | Finalizing video loop              |

---

## Caching

CityMood uses multi-level caching for fast responses and cost efficiency.

### Cache Durations

| Resource | Cache Duration | Cache Key |
|----------|----------------|-----------|
| Weather  | 1 hour         | City name (normalized) |
| Images   | Indefinite     | City + weather category + time of day |
| Videos   | Indefinite     | City + weather category + time of day |

### How Caching Works

1. **Weather**: Fresh weather is fetched from the weather API and cached for 1 hour
2. **Images**: When you request an image, we check if one exists for the city's current weather category and time of day
3. **Videos**: Same as images - cached by city + weather category + time of day

### Cache Indicators

All responses include a `cached` field:
- `cached: true` - Result served from cache (fast, typically < 100ms)
- `cached: false` - Result freshly generated

### Cache Invalidation

- Weather cache expires after 1 hour automatically
- Images/videos are regenerated when weather category changes (e.g., sunny → rainy)
- Images/videos are regenerated when time of day changes (day → night)

---

## Error Codes

| Code                     | HTTP Status | Description                          |
| ------------------------ | ----------- | ------------------------------------ |
| AUTH_MISSING             | 401         | No Authorization header provided     |
| AUTH_INVALID_FORMAT      | 401         | Use format: Bearer <api_key>         |
| AUTH_INVALID_KEY         | 401         | API key not recognized               |
| RATE_LIMITED             | 429         | Job already in progress              |
| INVALID_BODY             | 400         | Request body is not valid JSON       |
| MISSING_CITY             | 400         | City field is required               |
| INVALID_CITY             | 400         | City name validation failed          |
| CITY_NOT_FOUND           | 404         | City not found in weather database   |
| JOB_NOT_FOUND            | 404         | Job ID not found or expired          |
| VIDEO_GENERATION_FAILED  | 500         | Video generation error               |
| INTERNAL_ERROR           | 500         | Unexpected server error              |

---

## Client Examples

### JavaScript/TypeScript

```typescript
const API_KEY = 'your-api-key';
const BASE_URL = 'https://citymood-production.up.railway.app/api/v1';

async function generateCityVideo(city: string, country?: string) {
  // 1. Submit the job
  const submitRes = await fetch(`${BASE_URL}/city-video`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ city, country }),
  });

  if (!submitRes.ok) {
    const error = await submitRes.json();
    throw new Error(error.error.message);
  }

  const { data } = await submitRes.json();
  const { job_id } = data;

  // 2. Poll for completion
  while (true) {
    const statusRes = await fetch(`${BASE_URL}/city-video/${job_id}`, {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });

    const status = await statusRes.json();

    if (status.data?.status === 'completed') {
      return status.data.result;
    }

    if (!status.success || status.data?.status === 'failed') {
      throw new Error(status.error?.message || 'Job failed');
    }

    // Log progress
    if (status.data?.progress) {
      const { current_step, total_steps, message } = status.data.progress;
      console.log(`[${current_step}/${total_steps}] ${message}`);
    }

    // Wait 2 seconds before next poll
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

// Usage
const result = await generateCityVideo('Tokyo', 'Japan');
console.log('Video URL:', result.video_url);
```

### Python

```python
import requests
import time

API_KEY = 'your-api-key'
BASE_URL = 'https://citymood-production.up.railway.app/api/v1'

def generate_city_video(city: str, country: str = None):
    headers = {
        'Authorization': f'Bearer {API_KEY}',
        'Content-Type': 'application/json',
    }

    # 1. Submit the job
    payload = {'city': city}
    if country:
        payload['country'] = country

    response = requests.post(f'{BASE_URL}/city-video', json=payload, headers=headers)
    response.raise_for_status()

    job_id = response.json()['data']['job_id']
    print(f'Job submitted: {job_id}')

    # 2. Poll for completion
    while True:
        status_response = requests.get(
            f'{BASE_URL}/city-video/{job_id}',
            headers=headers
        )
        status = status_response.json()

        # Check for completion
        if status.get('data', {}).get('status') == 'completed':
            return status['data']['result']

        # Check for failure
        if not status.get('success') or status.get('data', {}).get('status') == 'failed':
            raise Exception(status.get('error', {}).get('message', 'Job failed'))

        # Log progress
        progress = status.get('data', {}).get('progress', {})
        if progress:
            print(f"[{progress['current_step']}/{progress['total_steps']}] {progress['message']}")

        time.sleep(2)

# Usage
result = generate_city_video('Tokyo', 'Japan')
print(f"Video URL: {result['video_url']}")
```

### Swift (iOS)

```swift
import Foundation

class CityMoodAPI {
    private let baseURL = "https://citymood-production.up.railway.app/api/v1"
    private var apiKey: String?

    // Get device ID (persists across app reinstalls)
    private var deviceId: String {
        UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
    }

    // Register device and get API key (call on first launch)
    func register() async throws -> String {
        let url = URL(string: "\(baseURL)/register")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "device_id": deviceId,
            "device_name": UIDevice.current.name,
            "app_version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, _) = try await URLSession.shared.data(for: request)
        let response = try JSONDecoder().decode(RegisterResponse.self, from: data)

        // Store in Keychain for persistence
        self.apiKey = response.data.apiKey
        return response.data.apiKey
    }

    // Generate city video
    func generateVideo(city: String, country: String? = nil) async throws -> VideoResult {
        guard let apiKey = apiKey else {
            throw APIError.notRegistered
        }

        // 1. Submit job
        let submitURL = URL(string: "\(baseURL)/city-video")!
        var submitRequest = URLRequest(url: submitURL)
        submitRequest.httpMethod = "POST"
        submitRequest.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        submitRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")

        var body: [String: String] = ["city": city]
        if let country = country { body["country"] = country }
        submitRequest.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (submitData, _) = try await URLSession.shared.data(for: submitRequest)
        let submitResponse = try JSONDecoder().decode(SubmitResponse.self, from: submitData)
        let jobId = submitResponse.data.jobId

        // 2. Poll for completion
        while true {
            let statusURL = URL(string: "\(baseURL)/city-video/\(jobId)")!
            var statusRequest = URLRequest(url: statusURL)
            statusRequest.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

            let (statusData, _) = try await URLSession.shared.data(for: statusRequest)
            let status = try JSONDecoder().decode(StatusResponse.self, from: statusData)

            switch status.data.status {
            case "completed":
                return status.data.result!
            case "failed":
                throw APIError.jobFailed(status.error?.message ?? "Unknown error")
            default:
                // Log progress
                if let progress = status.data.progress {
                    print("[\(progress.currentStep)/\(progress.totalSteps)] \(progress.message)")
                }
                try await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds
            }
        }
    }
}

// Response models
struct RegisterResponse: Codable {
    let data: RegisterData
    struct RegisterData: Codable {
        let apiKey: String
        enum CodingKeys: String, CodingKey { case apiKey = "api_key" }
    }
}

struct SubmitResponse: Codable {
    let data: SubmitData
    struct SubmitData: Codable {
        let jobId: String
        enum CodingKeys: String, CodingKey { case jobId = "job_id" }
    }
}

struct StatusResponse: Codable {
    let data: StatusData
    let error: ErrorData?

    struct StatusData: Codable {
        let status: String
        let progress: Progress?
        let result: VideoResult?
    }
    struct Progress: Codable {
        let currentStep: Int
        let totalSteps: Int
        let message: String
        enum CodingKeys: String, CodingKey {
            case currentStep = "current_step"
            case totalSteps = "total_steps"
            case message
        }
    }
    struct ErrorData: Codable {
        let message: String
    }
}

struct VideoResult: Codable {
    let videoUrl: String
    let city: String
    let weather: Weather

    enum CodingKeys: String, CodingKey {
        case videoUrl = "video_url"
        case city
        case weather
    }

    struct Weather: Codable {
        let category: String
        let temperatureC: Double
        enum CodingKeys: String, CodingKey {
            case category
            case temperatureC = "temperature_c"
        }
    }
}

enum APIError: Error {
    case notRegistered
    case jobFailed(String)
}

// Usage
let api = CityMoodAPI()
Task {
    // First launch: register device
    let apiKey = try await api.register()
    // Store apiKey in Keychain

    // Generate video
    let result = try await api.generateVideo(city: "Tokyo", country: "Japan")
    print("Video URL: \(result.videoUrl)")
}
```

### cURL (Shell Script)

```bash
#!/bin/bash

API_KEY="your-api-key"
BASE_URL="https://citymood-production.up.railway.app/api/v1"

# Submit job
RESPONSE=$(curl -s -X POST "$BASE_URL/city-video" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"city": "Paris", "country": "France"}')

JOB_ID=$(echo $RESPONSE | jq -r '.data.job_id')
echo "Job submitted: $JOB_ID"

# Poll for completion
while true; do
  STATUS=$(curl -s "$BASE_URL/city-video/$JOB_ID" \
    -H "Authorization: Bearer $API_KEY")

  JOB_STATUS=$(echo $STATUS | jq -r '.data.status')

  if [ "$JOB_STATUS" = "completed" ]; then
    VIDEO_URL=$(echo $STATUS | jq -r '.data.result.video_url')
    echo "Video URL: $VIDEO_URL"
    break
  elif [ "$JOB_STATUS" = "failed" ] || [ "$(echo $STATUS | jq -r '.success')" = "false" ]; then
    echo "Job failed: $(echo $STATUS | jq -r '.error.message')"
    exit 1
  fi

  # Show progress
  MESSAGE=$(echo $STATUS | jq -r '.data.progress.message // empty')
  if [ -n "$MESSAGE" ]; then
    echo "Progress: $MESSAGE"
  fi

  sleep 2
done
```

---

## Best Practices

1. **Poll Interval:** Use 2-3 second intervals to avoid unnecessary requests
2. **Timeout:** Set a maximum polling time (e.g., 5 minutes) to handle edge cases
3. **Error Handling:** Always check both `success: false` and HTTP error status codes
4. **Retry Logic:** Implement exponential backoff for transient errors (5xx status codes)
5. **Caching:** Videos are cached by city/weather - subsequent requests return faster
6. **Country Disambiguation:** For common city names (e.g., "Paris"), include the country

---

## Weather Categories

The API categorizes weather into these types, which affect the video animation:

| Category | Description                    | Animation Effect                      |
| -------- | ------------------------------ | ------------------------------------- |
| sunny    | Clear skies                    | Sun rays, light shimmer               |
| cloudy   | Overcast                       | Drifting clouds, soft light changes   |
| foggy    | Mist/fog                       | Fog wisps, atmospheric haze           |
| drizzle  | Light rain                     | Light rain particles, small ripples   |
| rainy    | Moderate rain                  | Steady rain, puddle ripples           |
| snowy    | Snow                           | Drifting snowflakes                   |
| sleet    | Mixed precipitation            | Mixed particles, icy effects          |
| stormy   | Heavy rain/thunderstorms       | Dramatic clouds, lightning flashes    |

---

## Webhook Support (Coming Soon)

Future versions will support webhooks to notify your server when a job completes,
eliminating the need for polling.
