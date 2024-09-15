// map.js

// Fetch crime data
function fetchCrimeData() {
  const resource_id = "34f74f13-3269-4916-b1a8-c5ba825972af";
  const limit = 10000;
  let offset = 0;
  let allRecords = [];

  function fetchPage() {
    const data = {
      resource_id: resource_id,
      limit: limit,
      offset: offset
    };

    return fetch("https://www.data.qld.gov.au/api/3/action/datastore_search?" + new URLSearchParams(data))
      .then(response => response.json())
      .then(data => {
        allRecords = allRecords.concat(data.result.records);
        if (data.result.records.length === limit) {
          offset += limit;
          return fetchPage();
        } else {
          return allRecords;
        }
      });
  }

  return fetchPage().catch(error => console.error('Error fetching crime data:', error));
}

// Aggregate crime data by division
function processCrimeData(records) {
  const crimeCounts = {};

  records.forEach(record => {
    let division = record["Division"];
    if (!division) return;

    // Normalize division names
    division = division.toLowerCase().trim();

    // Sum up all offences for the division
    const totalOffences = Object.keys(record).reduce((sum, key) => {
      if (key !== 'Division' && key !== 'Month Year' && key !== '_id') {
        return sum + parseInt(record[key] || 0, 10);
      }
      return sum;
    }, 0);

    if (crimeCounts[division]) {
      crimeCounts[division] += totalOffences;
    } else {
      crimeCounts[division] = totalOffences;
    }

    // console.log(`Division: ${division}, Total Offences: ${crimeCounts[division]}`);
  });

  return crimeCounts;
}

// Main map initialization function
function initMap() {

  const map = new google.maps.Map(document.getElementById('map'), {
    zoom: 10,
    center: { lat: -27.4698, lng: 153.0251 }, // Brisbane
    mapTypeId: 'roadmap'
  });

  // Fetch and add GeoJSON data
  fetch('https://cors-anywhere.herokuapp.com/https://gist.githubusercontent.com/theMichaelR/3c5272233ce9cf0c257cd7d9cd27a48f/raw/QPS_DIVISIONS.kml')
    .then(response => response.text())
    .then(kmlText => {
      const kml = new DOMParser().parseFromString(kmlText, 'text/xml');
      const geojson = toGeoJSON.kml(kml);

      map.data.addGeoJson(geojson);

      // Fetch crime data after GeoJSON is loaded
      return fetchCrimeData();
    })
    .then(records => {
      const crimeCounts = processCrimeData(records);
      applyBoundaryStyles(map, crimeCounts);
    })
    .catch(error => console.error('Error loading data:', error));
  }

// Map crime data to divisions and apply styles
function applyBoundaryStyles(map, crimeCounts) {
  // Get max and min crime counts for scaling
  const counts = Object.values(crimeCounts);
  const maxCount = Math.max(...counts);
  const minCount = Math.min(...counts);
  // console.log(`Max crime count: ${maxCount}, Min crime count: ${minCount}`);

  map.data.setStyle(function(feature) {
    // Collect properties
    const properties = {};
    feature.forEachProperty(function(value, name) {
      properties[name] = value;
    });
    // console.log('Feature properties:', properties); 

    let divisionName = feature.getProperty('Name') || feature.getProperty('name');
    if (!divisionName) return {};

    // Normalize division name
    divisionName = divisionName.toLowerCase().trim();

    const crimeCount = crimeCounts[divisionName] || 0;

    // console.log(`Applying style to division: ${divisionName}, Crime Count: ${crimeCount}`);

    const color = getColorForCrimeCount(crimeCount, minCount, maxCount);

    return {
      fillColor: color,
      strokeColor: 'black',
      strokeWeight: 1,
      fillOpacity: 0.6
    };
  });

  // TODO: Add click listener for divisions and display more detailed statistics
  map.data.addListener('click', function(event) {
    const divisionName = event.feature.getProperty('Name');
    const divisionNameNormalized = divisionName.toLowerCase().trim();
    const crimeCount = crimeCounts[divisionNameNormalized] || 0;
    const contentString = `<strong>${divisionName}</strong><br>Total Crimes: ${crimeCount}`;

    const infowindow = new google.maps.InfoWindow({
      content: contentString,
      position: event.latLng
    });

    infowindow.open(map);
  });
}

// Generate color based on crime count
function getColorForCrimeCount(count, min, max) {
  let normalized = 0;
  if (max !== min) {
    normalized = (count - min) / (max - min);
  }

  // Interpolate between green (low crime) and red (high crime)
  const red = Math.floor(255 * normalized);
  const green = Math.floor(255 * (1 - normalized));

  return `rgb(${red}, ${green}, 0)`;
}

