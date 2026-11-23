package com.plinthwell.roaamm.trips;

import com.plinthwell.roaamm.auth.Access;
import com.plinthwell.roaamm.auth.SessionService;
import com.plinthwell.roaamm.auth.User;
import com.plinthwell.roaamm.common.Page;
import com.plinthwell.roaamm.common.PlainText;
import com.plinthwell.roaamm.passkey.PasskeyException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.dao.DataAccessException;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * A member's own trips (M4a). Only the owner can see or change a trip; any
 * other trip id answers 404, never 403, so ids cannot be probed. Shared demo
 * users keep their newest rows instead of being blocked at the cap, and the
 * fixed sample trips cannot be changed.
 */
@Service
public class TripService {

    public static final int TITLE_MAX = 80;
    public static final int DESTINATION_MAX = 80;
    public static final int NOTES_MAX = 500;
    public static final Set<String> WHEN = Set.of("all", "upcoming", "past");

    /** Checked, cleaned values ready to store. {@code notes} may be null. */
    public record Fields(String title, String destination, LocalDate startDate, LocalDate endDate, String status,
            String notes) {}

    /** Raw input. On update, a null field keeps its value; notes "" clears them. */
    public record Input(String title, String destination, String startDate, String endDate, String status,
            String notes) {}

    public record TripList(Page<TripRepository.Trip> page, Map<String, Long> counts, int max) {}

    private static final UUID SAMPLE_PAST = UUID.fromString("00000000-0000-4000-8000-000000000401");
    private static final UUID SAMPLE_SOON = UUID.fromString("00000000-0000-4000-8000-000000000402");
    private static final UUID SAMPLE_LATER = UUID.fromString("00000000-0000-4000-8000-000000000403");

    private final TripRepository repo;
    private final TripProperties props;
    private final TransactionTemplate tx;
    private final Clock clock;

    public TripService(TripRepository repo, TripProperties props, TransactionTemplate tx, Clock clock) {
        this.repo = repo;
        this.props = props;
        this.tx = tx;
        this.clock = clock;
    }

    public TripList list(SessionService.Current current, String when, int page, Integer size) {
        User user = Access.member(current);
        String w = when == null ? "all" : when;
        if (!WHEN.contains(w)) {
            throw new PasskeyException(400, "invalid_filter");
        }
        int p = Page.page(page);
        int s = Page.size(size, props.pageSize());
        var rows = repo.listForUser(user.id(), w, today(), s + 1, p * s);
        Map<String, Long> counts = repo.countsForUser(user.id());
        return new TripList(Page.of(rows, p, s, "all".equals(w) ? counts.get("total") : null), counts,
                props.maxPerUser());
    }

    public TripRepository.Trip get(SessionService.Current current, UUID id) {
        User user = Access.member(current);
        return repo.findOwned(id, user.id()).orElseThrow(TripService::notFound);
    }

    public TripRepository.Trip create(SessionService.Current current, Input in) {
        User user = Access.member(current);
        Fields f = check(in, null);
        UUID id = UUID.randomUUID();
        return tx.execute(status -> {
            int count = repo.lockAndCount(user.id());
            if (!user.isDemo() && count >= props.maxPerUser()) {
                throw new PasskeyException(409, "trip_limit_reached");
            }
            repo.insert(id, user.id(), f, user.isDemo(), clock.instant());
            if (user.isDemo()) {
                repo.trimDemoUser(user.id(), props.maxPerUser());
            }
            return repo.findOwned(id, user.id()).orElseThrow();
        });
    }

    public TripRepository.Trip update(SessionService.Current current, UUID id, Input in) {
        User user = Access.member(current);
        return tx.execute(status -> {
            var existing = repo.findOwned(id, user.id()).orElseThrow(TripService::notFound);
            if (existing.isSample()) {
                throw new PasskeyException(403, "sample_read_only");
            }
            Fields f = check(in, existing);
            if (!repo.update(id, user.id(), f, clock.instant())) {
                throw notFound();
            }
            return repo.findOwned(id, user.id()).orElseThrow();
        });
    }

    public void delete(SessionService.Current current, UUID id) {
        User user = Access.member(current);
        tx.executeWithoutResult(status -> {
            var existing = repo.findOwned(id, user.id()).orElseThrow(TripService::notFound);
            if (existing.isSample()) {
                throw new PasskeyException(403, "sample_read_only");
            }
            if (!repo.delete(id, user.id())) {
                throw notFound();
            }
        });
    }

    // ---- housekeeping

    /** Demo visitors' trips after a day; the sample trips stay and keep their dates relative to today. */
    @Scheduled(fixedDelayString = "PT15M", initialDelayString = "PT4M")
    public void purge() {
        repo.deleteDemoBefore(clock.instant().minus(props.demoRetention()));
        moveSamples();
    }

    @EventListener(ApplicationReadyEvent.class)
    public void moveSamplesOnStart() {
        try {
            moveSamples();
        } catch (DataAccessException e) {
            // The 15-minute job tries again; a slow database must not stop startup.
        }
    }

    void moveSamples() {
        LocalDate today = today();
        repo.moveSample(SAMPLE_PAST, today.minusDays(60), today.minusDays(57));
        repo.moveSample(SAMPLE_SOON, today.plusDays(21), today.plusDays(28));
        repo.moveSample(SAMPLE_LATER, today.plusDays(95), today.plusDays(106));
    }

    // ---- validation

    /** Checks the input; on update ({@code base} not null) missing fields keep their stored value. */
    Fields check(Input in, TripRepository.Trip base) {
        if (in == null) {
            throw new PasskeyException(400, "invalid_trip");
        }
        String title = pick(in.title(), base == null ? null : base.title(), v -> PlainText.line(v, TITLE_MAX),
                "invalid_title");
        String destination = pick(in.destination(), base == null ? null : base.destination(),
                v -> PlainText.place(v, DESTINATION_MAX, true), "invalid_destination");
        LocalDate start = in.startDate() == null && base != null ? base.startDate() : date(in.startDate());
        LocalDate end = in.endDate() == null && base != null ? base.endDate() : date(in.endDate());
        LocalDate today = today();
        // The 2-years-back / 3-years-ahead window applies when dates are set, so an
        // old trip can still get a new status or notes without moving its dates.
        boolean datesChanged = base == null || !start.equals(base.startDate()) || !end.equals(base.endDate());
        if (end.isBefore(start) || (datesChanged
                && (start.isBefore(today.minusYears(2)) || end.isAfter(today.plusYears(3))))) {
            throw new PasskeyException(400, "invalid_dates");
        }
        String status = in.status() == null ? (base == null ? "planned" : base.status()) : in.status();
        if (!TripRepository.STATUSES.contains(status)) {
            throw new PasskeyException(400, "invalid_status");
        }
        String notes;
        if (in.notes() == null) {
            notes = base == null ? null : base.notes();
        } else if (in.notes().isBlank()) {
            notes = null;
        } else {
            notes = PlainText.block(in.notes(), NOTES_MAX);
            if (notes == null) {
                throw new PasskeyException(400, "invalid_notes");
            }
        }
        return new Fields(title, destination, start, end, status, notes);
    }

    private static String pick(String input, String fallback, java.util.function.UnaryOperator<String> clean,
            String error) {
        if (input == null && fallback != null) {
            return fallback;
        }
        String v = clean.apply(input);
        if (v == null) {
            throw new PasskeyException(400, error);
        }
        return v;
    }

    private static LocalDate date(String input) {
        if (input == null || input.length() != 10) {
            throw new PasskeyException(400, "invalid_dates");
        }
        try {
            return LocalDate.parse(input);
        } catch (DateTimeParseException e) {
            throw new PasskeyException(400, "invalid_dates");
        }
    }

    private LocalDate today() {
        return LocalDate.ofInstant(clock.instant(), ZoneOffset.UTC);
    }

    private static PasskeyException notFound() {
        return new PasskeyException(404, "not_found");
    }
}
