package com.plinthwell.roaamm.guide;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.plinthwell.roaamm.audit.AuditLog;
import com.plinthwell.roaamm.auth.SessionCookie;
import com.plinthwell.roaamm.auth.SessionService;
import com.plinthwell.roaamm.passkey.PasskeyException;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.aot.hint.annotation.RegisterReflectionForBinding;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Guide applications: the member's own form and status, and the scoped admin review (ADR 0008). */
@RestController
@RegisterReflectionForBinding({
    GuideApplicationService.Input.class, GuideApplicationController.MineView.class,
    GuideApplicationController.ApplicationView.class, GuideApplicationController.AdminApplicationView.class,
    GuideApplicationController.EventView.class, GuideApplicationController.ListView.class,
    GuideApplicationController.DecisionRequest.class, GuideApplicationController.BulkDecisionRequest.class,
    GuideApplicationController.BulkDecisionView.class, GuideApplicationService.RowResult.class
})
public class GuideApplicationController {

    /** The member's view of their own application. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ApplicationView(UUID id, String status, String headline, String bio, List<String> languages,
            List<String> cities, String decisionNote, Instant createdAt, Instant reviewedAt, Instant decidedAt) {
        static ApplicationView of(GuideApplicationRepository.Application a) {
            return new ApplicationView(a.id(), a.status(), a.headline(), a.bio(), a.languages(), a.cities(),
                    a.decisionNote(), a.createdAt(), a.reviewedAt(), a.decidedAt());
        }
    }

    /** {@code status} is "none" until the first application. {@code reason} explains why canApply is false. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record MineView(String status, boolean canApply, String reason, ApplicationView application) {}

    public record EventView(String action, String admin, Instant at) {
        static EventView of(AuditLog.Event e) {
            return new EventView(e.action(), e.adminDisplayName(), e.createdAt());
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record AdminApplicationView(UUID id, UUID applicantId, String applicant, String applicantRole,
            boolean applicantVerified, String status, String headline, String bio, List<String> languages,
            List<String> cities, String reviewer, String decisionNote, Instant createdAt, Instant reviewedAt,
            Instant decidedAt, boolean sample, List<EventView> history) {
        static AdminApplicationView of(GuideApplicationRepository.Application a, List<EventView> history) {
            return new AdminApplicationView(a.id(), a.userId(), a.applicantDisplayName(), a.applicantRole(),
                    a.applicantVerified(), a.status(), a.headline(), a.bio(), a.languages(), a.cities(),
                    a.reviewerDisplayName(), a.decisionNote(), a.createdAt(), a.reviewedAt(), a.decidedAt(),
                    a.isSample(), history);
        }
    }

    public record ListView(List<AdminApplicationView> items, int page, int size, boolean hasMore, Long total,
            Map<String, Long> counts) {}

    public record DecisionRequest(String decision, String note) {}

    public record BulkDecisionRequest(List<String> ids, String decision, String note) {}

    public record BulkDecisionView(String decision, int succeeded, int failed,
            List<GuideApplicationService.RowResult> results) {
        static BulkDecisionView of(String decision, List<GuideApplicationService.RowResult> results) {
            int ok = (int) results.stream().filter(GuideApplicationService.RowResult::ok).count();
            return new BulkDecisionView(decision, ok, results.size() - ok, results);
        }
    }

    private final GuideApplicationService service;
    private final SessionService sessions;

    public GuideApplicationController(GuideApplicationService service, SessionService sessions) {
        this.service = service;
        this.sessions = sessions;
    }

    // ---- members

    @GetMapping("/v1/guide/application")
    public MineView mine(HttpServletRequest request) {
        var m = service.mine(current(request));
        return new MineView(m.latest().map(GuideApplicationRepository.Application::status).orElse("none"),
                m.canApply(), m.reason(), m.latest().map(ApplicationView::of).orElse(null));
    }

    @PostMapping("/v1/guide/application")
    public ResponseEntity<ApplicationView> apply(@RequestBody GuideApplicationService.Input body,
            HttpServletRequest request) {
        return ResponseEntity.status(201).body(ApplicationView.of(service.apply(current(request), body)));
    }

    // ---- admins

    @GetMapping("/v1/admin/guide-applications")
    public ListView list(@RequestParam(required = false) String status, @RequestParam(defaultValue = "0") int page,
            @RequestParam(required = false) Integer size, HttpServletRequest request) {
        var l = service.list(current(request), status == null || status.isEmpty() ? null : status, page, size);
        var p = l.page();
        return new ListView(p.items().stream().map(a -> AdminApplicationView.of(a, null)).toList(), p.page(),
                p.size(), p.hasMore(), p.total(), l.counts());
    }

    @GetMapping("/v1/admin/guide-applications/{id}")
    public AdminApplicationView detail(@PathVariable UUID id, HttpServletRequest request) {
        var d = service.detail(current(request), id);
        return AdminApplicationView.of(d.application(), d.history().stream().map(EventView::of).toList());
    }

    @PostMapping("/v1/admin/guide-applications/{id}/review")
    public AdminApplicationView review(@PathVariable UUID id, HttpServletRequest request) {
        return AdminApplicationView.of(service.review(current(request), id), null);
    }

    @PostMapping("/v1/admin/guide-applications/{id}/decision")
    public AdminApplicationView decide(@PathVariable UUID id, @RequestBody DecisionRequest body,
            HttpServletRequest request) {
        return AdminApplicationView.of(service.decide(current(request), id, body.decision(), body.note()), null);
    }

    @PostMapping("/v1/admin/guide-applications/bulk-decision")
    public BulkDecisionView bulk(@RequestBody BulkDecisionRequest body, HttpServletRequest request) {
        return BulkDecisionView.of(body.decision(),
                service.bulkDecide(current(request), body.ids(), body.decision(), body.note()));
    }

    private SessionService.Current current(HttpServletRequest request) {
        return sessions.currentSession(SessionCookie.read(request))
                .orElseThrow(() -> new PasskeyException(401, "unauthenticated"));
    }
}
