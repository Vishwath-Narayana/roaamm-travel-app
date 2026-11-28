package com.plinthwell.roaamm.trips;

import static com.plinthwell.roaamm.support.TestAccounts.browser;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.plinthwell.roaamm.support.PostgresTest;
import com.plinthwell.roaamm.support.TestAccounts;
import jakarta.servlet.http.Cookie;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

public class TripTest extends PostgresTest {

    static final UUID DEMO_TRAVELLER = UUID.fromString("00000000-0000-4000-8000-000000000001");
    static final UUID SAMPLE_SOON = UUID.fromString("00000000-0000-4000-8000-000000000402");

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper json;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    TripService service;

    TestAccounts accounts;

    @BeforeEach
    void setUp() {
        accounts = new TestAccounts(mvc, json, jdbc);
    }

    static LocalDate today() {
        return LocalDate.now(ZoneOffset.UTC);
    }

    public static Map<String, Object> trip(String title) {
        Map<String, Object> m = new HashMap<>();
        m.put("title", title);
        m.put("destination", "Kyoto, Japan");
        m.put("startDate", today().plusDays(10).toString());
        m.put("endDate", today().plusDays(14).toString());
        return m;
    }

    JsonNode body(ResultActions r) throws Exception {
        return json.readTree(r.andReturn().getResponse().getContentAsString());
    }

    ResultActions create(Cookie c, Map<String, Object> body) throws Exception {
        return mvc.perform(browser(post("/v1/trips")).cookie(c).content(json.writeValueAsString(body)));
    }

    ResultActions update(Cookie c, Object id, Map<String, Object> body) throws Exception {
        return mvc.perform(browser(patch("/v1/trips/" + id)).cookie(c).content(json.writeValueAsString(body)));
    }

    ResultActions remove(Cookie c, Object id) throws Exception {
        return mvc.perform(browser(delete("/v1/trips/" + id)).cookie(c));
    }

    String createId(Cookie c, String title) throws Exception {
        return body(create(c, trip(title)).andExpect(status().isCreated())).get("id").asString();
    }

    @Test
    void ownerCanCreateReadUpdateAndDelete() throws Exception {
        var user = accounts.real("Trip owner", "traveller");
        Map<String, Object> in = trip("  Autumn   temples ");
        in.put("notes", "Line one\r\n\r\n\r\nLine two");
        JsonNode created = body(create(user.cookie(), in).andExpect(status().isCreated()));
        assertThat(created.get("title").asString()).isEqualTo("Autumn temples");
        assertThat(created.get("status").asString()).isEqualTo("planned");
        assertThat(created.get("notes").asString()).isEqualTo("Line one\n\nLine two");
        assertThat(created.get("sample").asBoolean()).isFalse();
        String id = created.get("id").asString();

        mvc.perform(get("/v1/trips/" + id).cookie(user.cookie())).andExpect(status().isOk())
                .andExpect(content().json("{\"destination\":\"Kyoto, Japan\"}", JsonCompareMode.LENIENT));

        JsonNode updated = body(update(user.cookie(), id, Map.of("status", "ongoing", "notes", ""))
                .andExpect(status().isOk()));
        assertThat(updated.get("status").asString()).isEqualTo("ongoing");
        assertThat(updated.get("title").asString()).isEqualTo("Autumn temples");
        assertThat(updated.has("notes")).isFalse();

        JsonNode list = body(mvc.perform(get("/v1/trips").cookie(user.cookie())).andExpect(status().isOk()));
        assertThat(list.get("total").asLong()).isEqualTo(1);
        assertThat(list.at("/counts/ongoing").asLong()).isEqualTo(1);
        assertThat(list.get("max").asInt()).isEqualTo(20);

        remove(user.cookie(), id).andExpect(status().isNoContent());
        mvc.perform(get("/v1/trips/" + id).cookie(user.cookie())).andExpect(status().isNotFound());
        remove(user.cookie(), id).andExpect(status().isNotFound());
    }

    @Test
    void anotherUsersTripIsNotFoundForEveryVerb() throws Exception {
        var alice = accounts.real("Alice trips", "traveller");
        var bob = accounts.real("Bob trips", "guide");
        String id = createId(alice.cookie(), "Alice only");

        mvc.perform(get("/v1/trips/" + id).cookie(bob.cookie())).andExpect(status().isNotFound())
                .andExpect(content().json("{\"error\":\"not_found\"}", JsonCompareMode.STRICT));
        update(bob.cookie(), id, Map.of("title", "Taken")).andExpect(status().isNotFound());
        remove(bob.cookie(), id).andExpect(status().isNotFound());
        // A demo visitor cannot reach a real trip either.
        mvc.perform(get("/v1/trips/" + id).cookie(accounts.demo("traveller"))).andExpect(status().isNotFound());
        JsonNode bobs = body(mvc.perform(get("/v1/trips").cookie(bob.cookie())).andExpect(status().isOk()));
        assertThat(bobs.get("items")).isEmpty();

        mvc.perform(get("/v1/trips/" + id).cookie(alice.cookie()))
                .andExpect(content().json("{\"title\":\"Alice only\"}", JsonCompareMode.LENIENT));
    }

    @Test
    void theListFiltersByStatusAndSearchWithinTheOwnersTripsOnly() throws Exception {
        var owner = accounts.real("Filter owner", "traveller");
        var other = accounts.real("Filter other", "traveller");
        String kyoto = createId(owner.cookie(), "Temples in autumn");
        Map<String, Object> lisbon = trip("Food weekend");
        lisbon.put("destination", "Lisbon, Portugal");
        String lisbonId = body(create(owner.cookie(), lisbon).andExpect(status().isCreated())).get("id").asString();
        update(owner.cookie(), lisbonId, Map.of("status", "cancelled")).andExpect(status().isOk());
        // Another user's trip that matches the same search and status never shows up.
        String theirs = createId(other.cookie(), "Temples in spring");
        update(other.cookie(), theirs, Map.of("status", "cancelled")).andExpect(status().isOk());

        JsonNode cancelled = body(mvc.perform(get("/v1/trips?status=cancelled").cookie(owner.cookie()))
                .andExpect(status().isOk()));
        assertThat(cancelled.get("items").valueStream().map(n -> n.get("id").asString()).toList())
                .containsExactly(lisbonId);
        assertThat(cancelled.get("total").asLong()).isEqualTo(1);
        assertThat(cancelled.at("/counts/total").asLong()).isEqualTo(2);

        JsonNode search = body(mvc.perform(get("/v1/trips?q=temples").cookie(owner.cookie()))
                .andExpect(status().isOk()));
        assertThat(search.get("items").valueStream().map(n -> n.get("id").asString()).toList())
                .containsExactly(kyoto);
        assertThat(search.get("total").asLong()).isEqualTo(1);
        // Searches the destination too; % is a literal character, not a wildcard.
        JsonNode place = body(mvc.perform(get("/v1/trips?q=lisbon&status=cancelled").cookie(owner.cookie()))
                .andExpect(status().isOk()));
        assertThat(place.get("items")).hasSize(1);
        JsonNode literal = body(mvc.perform(get("/v1/trips?q=%25").cookie(owner.cookie()))
                .andExpect(status().isOk()));
        assertThat(literal.get("items")).isEmpty();

        mvc.perform(get("/v1/trips?status=lost").cookie(owner.cookie())).andExpect(status().isBadRequest())
                .andExpect(content().json("{\"error\":\"invalid_status\"}", JsonCompareMode.STRICT));
        mvc.perform(get("/v1/trips?q=" + "x".repeat(41)).cookie(owner.cookie()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void cancellingIsAnUpdateTheOwnerAloneCanMake() throws Exception {
        var owner = accounts.real("Cancel owner", "traveller");
        var stranger = accounts.real("Cancel stranger", "traveller");
        String id = createId(owner.cookie(), "To cancel");
        update(stranger.cookie(), id, Map.of("status", "cancelled")).andExpect(status().isNotFound());
        JsonNode same = body(mvc.perform(get("/v1/trips/" + id).cookie(owner.cookie())).andExpect(status().isOk()));
        assertThat(same.get("status").asString()).isEqualTo("planned");
        JsonNode done = body(update(owner.cookie(), id, Map.of("status", "cancelled")).andExpect(status().isOk()));
        assertThat(done.get("status").asString()).isEqualTo("cancelled");
        // End before start is refused on edit as well.
        update(owner.cookie(), id, Map.of("startDate", today().plusDays(9).toString(),
                "endDate", today().plusDays(8).toString())).andExpect(status().isBadRequest())
                .andExpect(content().json("{\"error\":\"invalid_dates\"}", JsonCompareMode.STRICT));
    }

    @Test
    void onlyTravellersAndGuidesHaveTrips() throws Exception {
        var admin = accounts.realAdmin("Trip admin");
        mvc.perform(get("/v1/trips").cookie(admin.cookie())).andExpect(status().isForbidden());
        create(admin.cookie(), trip("Nope")).andExpect(status().isForbidden());
        mvc.perform(get("/v1/trips").cookie(accounts.demo("admin"))).andExpect(status().isForbidden());
        mvc.perform(get("/v1/trips")).andExpect(status().isUnauthorized());
        mvc.perform(get("/v1/trips/not-a-uuid").cookie(accounts.demo("guide"))).andExpect(status().isBadRequest());
        // Writes still need the CSRF header and origin.
        mvc.perform(post("/v1/trips").cookie(accounts.demo("guide")).contentType("application/json")
                .content(json.writeValueAsString(trip("No csrf")))).andExpect(status().isForbidden());
    }

    @Test
    void everyFieldIsValidated() throws Exception {
        Cookie c = accounts.real("Validator", "traveller").cookie();
        Map<String, String> cases = new HashMap<>();
        cases.put("title", "x".repeat(81));
        cases.put("destination", "Kyoto 2026");
        cases.put("startDate", "2026/01/01");
        cases.put("notes", "n".repeat(501));
        cases.put("status", "lost");
        Map<String, String> errors = Map.of("title", "invalid_title", "destination", "invalid_destination",
                "startDate", "invalid_dates", "notes", "invalid_notes", "status", "invalid_status");
        for (var e : cases.entrySet()) {
            Map<String, Object> in = trip("Valid");
            in.put(e.getKey(), e.getValue());
            create(c, in).andExpect(status().isBadRequest())
                    .andExpect(content().json("{\"error\":\"" + errors.get(e.getKey()) + "\"}", JsonCompareMode.STRICT));
        }
        for (String bad : List.of("", "   ", "<b>", "Tab\u0007")) {
            create(c, trip(bad)).andExpect(status().isBadRequest());
        }
        for (String place : List.of("https://example.com", "Kyoto <Japan>", "A, B, C, D", ",")) {
            Map<String, Object> in = trip("Valid");
            in.put("destination", place);
            create(c, in).andExpect(status().isBadRequest());
        }
        Map<String, Object> backwards = trip("Backwards");
        backwards.put("endDate", today().plusDays(5).toString());
        create(c, backwards).andExpect(status().isBadRequest())
                .andExpect(content().json("{\"error\":\"invalid_dates\"}", JsonCompareMode.STRICT));
        Map<String, Object> tooOld = trip("Too old");
        tooOld.put("startDate", today().minusYears(2).minusDays(1).toString());
        create(c, tooOld).andExpect(status().isBadRequest());
        Map<String, Object> tooFar = trip("Too far");
        tooFar.put("endDate", today().plusYears(3).plusDays(1).toString());
        create(c, tooFar).andExpect(status().isBadRequest());
        Map<String, Object> edges = trip("Edges");
        edges.put("startDate", today().minusYears(2).toString());
        edges.put("endDate", today().plusYears(3).toString());
        edges.put("destination", "São Tomé, São Tomé and Príncipe");
        create(c, edges).andExpect(status().isCreated());
        Map<String, Object> exact = trip("x".repeat(80));
        exact.put("notes", "n".repeat(500));
        create(c, exact).andExpect(status().isCreated());

        String id = createId(c, "Patch me");
        update(c, id, Map.of("endDate", today().plusDays(1).toString())).andExpect(status().isBadRequest())
                .andExpect(content().json("{\"error\":\"invalid_dates\"}", JsonCompareMode.STRICT));
        mvc.perform(browser(post("/v1/trips")).cookie(c).content("not json")).andExpect(status().isBadRequest());

        // An old trip (outside the window today) can still change status without moving its dates.
        jdbc.sql("UPDATE trips SET start_date = current_date - 900, end_date = current_date - 890 WHERE id = :id")
                .param("id", UUID.fromString(id)).update();
        update(c, id, Map.of("status", "completed")).andExpect(status().isOk());
        update(c, id, Map.of("endDate", today().minusDays(880).toString())).andExpect(status().isBadRequest());
    }

    @Test
    void realUsersStopAtTwentyTrips() throws Exception {
        Cookie c = accounts.real("Busy traveller", "traveller").cookie();
        for (int i = 0; i < 20; i++) {
            create(c, trip("Trip " + i)).andExpect(status().isCreated());
        }
        create(c, trip("One more")).andExpect(status().isConflict())
                .andExpect(content().json("{\"error\":\"trip_limit_reached\"}", JsonCompareMode.STRICT));
        JsonNode page = body(mvc.perform(get("/v1/trips?size=500").cookie(c)).andExpect(status().isOk()));
        assertThat(page.get("size").asInt()).isEqualTo(50);
        JsonNode small = body(mvc.perform(get("/v1/trips?size=7&page=1").cookie(c)).andExpect(status().isOk()));
        assertThat(small.get("items")).hasSize(7);
        assertThat(small.get("hasMore").asBoolean()).isTrue();
        mvc.perform(get("/v1/trips?when=soon").cookie(c)).andExpect(status().isBadRequest());
    }

    @Test
    void theDemoTravellerSeesSampleTripsThatCannotBeChanged() throws Exception {
        Cookie demo = accounts.demo("traveller");
        JsonNode all = body(mvc.perform(get("/v1/trips?size=50").cookie(demo)).andExpect(status().isOk()));
        List<JsonNode> samples = all.get("items").valueStream().filter(n -> n.get("sample").asBoolean()).toList();
        assertThat(samples).hasSize(3);

        JsonNode upcoming = body(mvc.perform(get("/v1/trips?when=upcoming").cookie(demo)).andExpect(status().isOk()));
        assertThat(upcoming.get("items").valueStream().filter(n -> n.get("sample").asBoolean()).count()).isEqualTo(2);

        update(demo, SAMPLE_SOON, Map.of("title", "Mine now")).andExpect(status().isForbidden())
                .andExpect(content().json("{\"error\":\"sample_read_only\"}", JsonCompareMode.STRICT));
        remove(demo, SAMPLE_SOON).andExpect(status().isForbidden());
        assertThat(jdbc.sql("SELECT title FROM trips WHERE id = :id").param("id", SAMPLE_SOON)
                .query(String.class).single()).isEqualTo("Temples in autumn");

        // Demo visitors can still make and change their own trips.
        String id = createId(demo, "Visitor trip");
        update(demo, id, Map.of("status", "cancelled")).andExpect(status().isOk());
        remove(demo, id).andExpect(status().isNoContent());
        // The demo guide's trips are separate from the traveller's.
        mvc.perform(get("/v1/trips/" + SAMPLE_SOON).cookie(accounts.demo("guide"))).andExpect(status().isNotFound());
    }

    @Test
    void sampleTripsKeepTheirDatesRelativeToToday() {
        jdbc.sql("UPDATE trips SET start_date = '2020-01-01', end_date = '2020-01-02' WHERE id = :id")
                .param("id", SAMPLE_SOON).update();
        service.moveSamples();
        LocalDate start = jdbc.sql("SELECT start_date FROM trips WHERE id = :id").param("id", SAMPLE_SOON)
                .query(LocalDate.class).single();
        assertThat(start).isEqualTo(today().plusDays(21));
    }

    @Test
    void purgeDeletesOldDemoVisitorTripsButKeepsSamplesAndRealTrips() throws Exception {
        Cookie demo = accounts.demo("guide");
        String demoTrip = createId(demo, "Old demo trip");
        var real = accounts.real("Keeper", "traveller");
        String realTrip = createId(real.cookie(), "Real trip");
        jdbc.sql("UPDATE trips SET created_at = now() - interval '25 hours' WHERE id IN (:a, :b)")
                .param("a", UUID.fromString(demoTrip)).param("b", UUID.fromString(realTrip)).update();

        service.purge();
        assertThat(jdbc.sql("SELECT count(*) FROM trips WHERE id = :id").param("id", UUID.fromString(demoTrip))
                .query(Integer.class).single()).isZero();
        assertThat(jdbc.sql("SELECT count(*) FROM trips WHERE id = :id").param("id", UUID.fromString(realTrip))
                .query(Integer.class).single()).isOne();
        assertThat(jdbc.sql("SELECT count(*) FROM trips WHERE is_sample").query(Integer.class).single())
                .isEqualTo(3);
    }
}
