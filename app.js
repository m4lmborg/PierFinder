let userLocation;

// Thames Clipper Pier locations
const piers = [
  { name: 'Putney', lat: 51.4683, lng: -0.2135 },
  { name: 'Wandsworth Riverside Quarter', lat: 51.4595, lng: -0.1987 },
  { name: 'Plantation Wharf', lat: 51.4660, lng: -0.1860 },
  { name: 'Chelsea Harbour', lat: 51.4740, lng: -0.1820 },
  { name: 'Cadogan', lat: 51.4840, lng: -0.1670 },
  { name: 'Battersea Power Station', lat: 51.4820, lng: -0.1440 },
  { name: 'Vauxhall (St George Wharf)', lat: 51.4850, lng: -0.1250 },
  { name: 'Millbank', lat: 51.4910, lng: -0.1250 },
  { name: 'Westminster', lat: 51.5010, lng: -0.1220 },
  { name: 'London Eye (Waterloo)', lat: 51.5033, lng: -0.1195 },
  { name: 'Embankment', lat: 51.5073, lng: -0.1212 },
  { name: 'Blackfriars', lat: 51.5110, lng: -0.1040 },
  { name: 'Bankside', lat: 51.5080, lng: -0.0980 },
  { name: 'London Bridge City', lat: 51.5060, lng: -0.0860 },
  { name: 'Tower', lat: 51.5074, lng: -0.0792 },
  { name: 'Canary Wharf', lat: 51.5050, lng: -0.0230 },
  { name: 'Greenland (Surrey Quays)', lat: 51.4950, lng: -0.0410 },
  { name: 'Masthouse Terrace', lat: 51.4910, lng: -0.0320 },
  { name: 'Greenwich', lat: 51.4820, lng: -0.0090 },
  { name: 'North Greenwich (The O2)', lat: 51.5000, lng: 0.0030 },
  { name: 'Royal Wharf', lat: 51.5020, lng: 0.0320 },
  { name: 'Woolwich (Royal Arsenal)', lat: 51.4910, lng: 0.0700 },
  { name: 'Barking Riverside', lat: 51.5163, lng: 0.1173 },
];

// Timetable URLs
const timetables = {
  weekday: {
    westbound: 'https://www.thamesclippers.com/plan-your-journey/timetable/weekday-westbound',
    eastbound: 'https://www.thamesclippers.com/plan-your-journey/timetable/weekday-eastbound'
  },
  weekend: {
    westbound: 'https://www.thamesclippers.com/plan-your-journey/timetable/weekend-westbound',
    eastbound: 'https://www.thamesclippers.com/plan-your-journey/timetable/weekend-eastbound'
  }
};

// Check if today is a weekday or weekend
function getTimetableURLs() {
  const today = new Date();
  const isWeekend = today.getDay() === 0 || today.getDay() === 6;
  return isWeekend ? timetables.weekend : timetables.weekday;
}

// Start and update the clock every second
function startClock() {
  const clockElement = document.getElementById("clock");
  setInterval(() => {
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    clockElement.textContent = `Current Local Time: ${timeString}`;
  }, 1000);
}

// Find the nearest pier
function findNearestPier() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((position) => {
      userLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };

      let closestPier = null;
      let shortestDistance = Infinity;

      // Calculate distance to each pier
      piers.forEach((pier) => {
        const distance = calculateDistance(userLocation, pier);
        if (distance < shortestDistance) {
          shortestDistance = distance;
          closestPier = pier;
        }
      });

      displayNearestPier(closestPier, shortestDistance);
      displayTimetables();
    });
  } else {
    alert("Geolocation is not supported by this browser.");
  }
}

// Haversine formula to calculate distance between two lat/lng points
function calculateDistance(loc1, loc2) {
  const R = 6371; // Radius of the Earth in km
  const dLat = degToRad(loc2.lat - loc1.lat);
  const dLng = degToRad(loc2.lng - loc1.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(degToRad(loc1.lat)) *
      Math.cos(degToRad(loc2.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

function degToRad(deg) {
  return deg * (Math.PI / 180);
}

// Display the nearest pier and link to its location on Google Maps
function displayNearestPier(pier, distance) {
  const results = document.getElementById("results");
  const googleMapsLink = `https://www.google.com/maps/search/?api=1&query=${pier.lat},${pier.lng}`;
  
  results.innerHTML = `
    <h3>Nearest Pier: ${pier.name}</h3>
    <p>Distance: ${distance.toFixed(2)} km</p>
    <p><a href="${googleMapsLink}" target="_blank">View ${pier.name} on Google Maps</a></p>
  `;
}

// Display the timetable links based on the day
function displayTimetables() {
  const timetableURLs = getTimetableURLs();
  const results = document.getElementById("results");
  
  results.innerHTML += `
    <div class="timetable-links">
      <h3>Today's Timetables</h3>
      <p><a href="${timetableURLs.westbound}" target="_blank">Westbound Timetable</a></p>
      <p><a href="${timetableURLs.eastbound}" target="_blank">Eastbound Timetable</a></p>
    </div>
  `;
}

// Start the clock when the page loads
window.onload = startClock;
