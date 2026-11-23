package com.plinthwell.roaamm.trips;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.plinthwell.roaamm.auth.SessionCookie;
import com.plinthwell.roaamm.auth.SessionService;
import com.plinthwell.roaamm.common.Page;
import com.plinthwell.roaamm.passkey.PasskeyException;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.aot.hint.annotation.RegisterReflectionForBinding;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** A traveller's or guide's own trips (M4a). */
@RestController
@RegisterReflectionForBinding({
    TripService.Input.class, TripController.TripView.class, TripController.TripListView.class, Page.class
})
public class TripController {

    /** Dates are ISO strings (2026-05-01). {@code sample} marks the fixed simulated trips. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record TripView(UUID id, String title, String destination, String startDate, String endDate,
            String status, String notes, boolean sample, Instant createdAt, Instant updatedAt) {
        static TripView of(TripRepository.Trip t) {
            return new TripView(t.id(), t.title(), t.destination(), t.startDate().toString(),
                    t.endDate().toString(), t.status(), t.notes(), t.isSample(), t.createdAt(), t.updatedAt());
        }
    }

    public record TripListView(List<TripView> items, int page, int size, boolean hasMore, Long total,
            Map<String, Long> counts, int max) {}

    private final TripService service;
    private final SessionService sessions;

    public TripController(TripService service, SessionService sessions) {
        this.service = service;
        this.sessions = sessions;
    }

    @GetMapping("/v1/trips")
    public TripListView list(@RequestParam(defaultValue = "all") String when,
            @RequestParam(defaultValue = "0") int page, @RequestParam(required = false) Integer size,
            HttpServletRequest request) {
        var l = service.list(current(request), when, page, size);
        var p = l.page();
        return new TripListView(p.items().stream().map(TripView::of).toList(), p.page(), p.size(), p.hasMore(),
                p.total(), l.counts(), l.max());
    }

    @PostMapping("/v1/trips")
    public ResponseEntity<TripView> create(@RequestBody TripService.Input body, HttpServletRequest request) {
        return ResponseEntity.status(201).body(TripView.of(service.create(current(request), body)));
    }

    @GetMapping("/v1/trips/{id}")
    public TripView get(@PathVariable UUID id, HttpServletRequest request) {
        return TripView.of(service.get(current(request), id));
    }

    @PatchMapping("/v1/trips/{id}")
    public TripView update(@PathVariable UUID id, @RequestBody TripService.Input body, HttpServletRequest request) {
        return TripView.of(service.update(current(request), id, body));
    }

    @DeleteMapping("/v1/trips/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id, HttpServletRequest request) {
        service.delete(current(request), id);
        return ResponseEntity.noContent().build();
    }

    private SessionService.Current current(HttpServletRequest request) {
        return sessions.currentSession(SessionCookie.read(request))
                .orElseThrow(() -> new PasskeyException(401, "unauthenticated"));
    }
}
