insert into public.data_versions (version, notes, is_current) values ('2026.10.23-sample', 'SAMPLE data only', true);
-- SAMPLE rows only (is_sample = true). Real data loaded from dist/ once sources are provided.
insert into public.airports (ident, iata, icao, name, city, country, latitude, longitude, elevation_ft, type, is_sample) values
 ('SAMPLE-KJFK','JFK','KJFK','John F. Kennedy International Airport (SAMPLE)','New York','US',40.6398,-73.7789,13,'large_airport',true),
 ('SAMPLE-EGLL','LHR','EGLL','London Heathrow Airport (SAMPLE)','London','GB',51.4706,-0.4619,83,'large_airport',true),
 ('SAMPLE-RJTT','HND','RJTT','Tokyo Haneda Airport (SAMPLE)','Tokyo','JP',35.5523,139.78,35,'large_airport',true);
insert into public.airlines (ident, name, iata, icao, callsign, country, country_code, active, major, is_sample) values
 ('UAL','United Airlines (SAMPLE)','UA','UAL','UNITED','United States','US',true,true,true),
 ('BAW','British Airways (SAMPLE)','BA','BAW','SPEEDBIRD','United Kingdom','GB',true,true,true),
 ('ANA','All Nippon Airways (SAMPLE)','NH','ANA','ALL NIPPON','Japan','JP',true,true,true);
insert into public.aircraft_types (ident, icao, iata, family, name, short_name, alternate_names, manufacturer, engine_count, engine_type, aircraft_type, in_production, status, major, is_primary, wake_category, is_sample) values
 ('B77W','B77W','77W','777','Boeing 777-300ER (SAMPLE)','777-300ER','{777-300ER,Triple Seven}','Boeing',2,'Turbofan','jet_aircraft',true,'Operational',true,true,'H',true),
 ('A359','A359','359','A350','Airbus A350-900 (SAMPLE)','A350-900','{A350}','Airbus',2,'Turbofan','jet_aircraft',true,'Operational',true,true,'H',true),
 ('B38M','B38M','7M8','737 MAX','Boeing 737 MAX 8 (SAMPLE)','737 MAX 8','{737-8,737 MAX}','Boeing',2,'Turbofan','jet_aircraft',true,'Operational',true,true,'M',true);
-- SAMPLE airline hubs
insert into public.airline_hubs (airline_id, airport_id, is_primary)
select al.id, ap.id, v.is_primary
from (values ('BAW','EGLL',true), ('ANA','RJTT',true), ('UAL','KJFK',false)) as v(airline_icao, airport_icao, is_primary)
join public.airlines al on al.ident = v.airline_icao
join public.airports ap on ap.icao = v.airport_icao;
